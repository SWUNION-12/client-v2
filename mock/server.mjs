#!/usr/bin/env node
// Spring 없이 화면을 볼 때 쓰는 목업 서버. 응답 모양은 prototype-server의 컨트롤러를 따른다. 데이터는 메모리에만 있다.
//
// 계정: instructor / instructor
// 체험: 수업 코드 NYW7D6으로 학생 입장. MOCK_EMPTY=1이면 수업 없이 시작한다.
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 8081);
const SEED = process.env.MOCK_EMPTY !== '1';
const INSTRUCTOR = { username: 'instructor', password: 'instructor' };
const NOTE = '이 수업에서 2번 이상 나온 오류';

const now = () => new Date().toISOString();
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
const randomId = () => randomBytes(16).toString('hex');
const randomCode = () =>
  Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

let nextId = 1;
const courses = new Map();
const sessions = new Map();
const instructorCookies = new Set();

function addCourse(fields) {
  const course = {
    id: nextId++,
    name: '',
    pythonVersion: '3.12',
    packages: [],
    status: 'READY',
    errorSummary: null,
    entryCode: randomCode(),
    createdAt: now(),
    errors: [],
    ...fields,
  };
  courses.set(course.id, course);
  return course;
}

function addSession(course, name, pin, fields = {}) {
  const session = {
    id: nextId++,
    token: randomId(),
    courseId: course.id,
    name,
    pin,
    containerRunning: true,
    ideConnected: true,
    lastSeenAt: now(),
    envStatus: 'OK',
    issues: [],
    extras: [],
    local: { status: 'NONE', os: null, arch: null, python: null, failed: [] },
    needsHelp: false,
    needsHelpReason: null,
    recentActions: [],
    startupMillis: 3200,
    workspaceLost: false,
    ...fields,
  };
  sessions.set(session.token, session);
  return session;
}

const action = (minutes, trigger, classification, tools, outcome, summary) => ({
  at: minutesAgo(minutes),
  trigger,
  classification,
  tools,
  outcome,
  summary,
});

function seed() {
  const a = addCourse({ name: 'Class 1', packages: ['pandas', 'numpy'], entryCode: 'NYW7D6' });
  a.errors = [
    { errorType: 'IndexError', student: '박서준' },
    { errorType: 'IndexError', student: '김지호' },
    { errorType: 'IndexError', student: '윤지후' },
    { errorType: 'ModuleNotFoundError', student: '김하은' },
    { errorType: 'ModuleNotFoundError', student: '문시우' },
  ];
  addSession(a, '박서준', '1234', {
    needsHelp: true,
    needsHelpReason: '학생 호출',
    recentActions: [action(3, 'HELP', 'CODE', ['explain_to_student', 'finish'], 'EXPLAINED', 'IndexError 의미와 확인할 곳 안내')],
    issues: ['pandas 버전 다름 (2.1.0, 기준 2.2.3)'],
    local: { status: 'DIAGNOSED', os: 'macos', arch: 'arm64', python: '3.12.4', failed: [] },
  });
  addSession(a, '윤지후', '2222', {
    needsHelp: true,
    needsHelpReason: '스펙 밖 요청 → 강사에게 전달',
    recentActions: [action(9, 'HELP', 'OUT_OF_SCOPE', ['escalate_to_instructor', 'finish'], 'ESCALATED', '스펙 밖 요청 → 강사에게 전달')],
    local: { status: 'FAIL', os: 'windows', arch: 'x86_64', python: 'none', failed: ['torch:ImportError'] },
  });
  addSession(a, '강민준', '3333', { local: { status: 'OK', os: 'macos', arch: 'arm64', python: '3.12.4', failed: [] } });
  addSession(a, '고서연', '4444', { ideConnected: false });
  addSession(a, '권도윤', '5555', {
    envStatus: 'REPAIRING',
    recentActions: [action(1, 'CHECK', 'ENV', ['restore_packages'], null, 'lock 기준으로 복구 중')],
  });
  addSession(a, '김지호', '6666', {
    recentActions: [action(19, 'CHECK', 'ENV', ['restore_packages', 'check_environment', 'finish'], 'RESOLVED', 'lock 기준으로 복구, 재점검 통과')],
  });
  addSession(a, '김하은', '7777', {
    envStatus: 'MISMATCH',
    issues: ['pandas 버전 다름 (2.1.0, 기준 2.2.3)'],
    extras: ['rich'],
    recentActions: [action(4, 'CHECK', 'ENV', ['check_environment'], 'NO_ACTION', 'pandas 버전 다름 (2.1.0, 기준 2.2.3)')],
  });
  addSession(a, '나윤서', '8888', { containerRunning: false, ideConnected: false, envStatus: 'UNKNOWN' });
  addSession(a, '박지안', null, { ideConnected: false });

  addCourse({ name: '방과후 데이터 분석', pythonVersion: '3.11', packages: ['numpy==2.1.0', 'matplotlib'], status: 'BUILDING', entryCode: null, createdAt: minutesAgo(1) });
  addCourse({
    name: '웹 크롤링 실습',
    packages: ['requests==9.9'],
    status: 'FAILED',
    entryCode: null,
    errorSummary: 'requests==9.9 버전을 찾을 수 없어서 환경을 만들지 못했어요.',
  });
  addCourse({ name: '여름 특강', pythonVersion: '3.10', packages: ['flask'], status: 'ENDED' });
}

const sessionsOf = (id) => [...sessions.values()].filter((s) => s.courseId === id);

const courseView = (c) => ({
  id: c.id,
  name: c.name,
  pythonVersion: c.pythonVersion,
  packages: c.packages,
  status: c.status,
  studentCount: sessionsOf(c.id).length,
  errorSummary: c.errorSummary,
  entryCode: c.entryCode,
  createdAt: c.createdAt,
});

function dashboardView(c) {
  const byType = new Map();
  for (const e of c.errors) {
    const row = byType.get(e.errorType) ?? { errorType: e.errorType, count: 0, students: new Set() };
    row.count++;
    row.students.add(e.student);
    byType.set(e.errorType, row);
  }
  return {
    course: { id: c.id, name: c.name, pythonVersion: c.pythonVersion, packages: c.packages, status: c.status, entryCode: c.entryCode, errorSummary: c.errorSummary },
    students: sessionsOf(c.id).map((s) => ({
      sessionId: s.id,
      name: s.name,
      containerRunning: s.containerRunning,
      ideConnected: s.ideConnected,
      lastSeenAt: s.lastSeenAt,
      envStatus: s.envStatus,
      issues: s.issues,
      extras: s.extras,
      local: s.local,
      needsHelp: s.needsHelp,
      needsHelpReason: s.needsHelpReason,
      recentActions: s.recentActions,
      startupMillis: s.startupMillis,
      pinSet: s.pin !== null,
    })),
    repeatedErrors: [...byType.values()].map((r) => ({ ...r, students: [...r.students] })).sort((x, y) => y.count - x.count),
    repeatedErrorsNote: NOTE,
  };
}

function provision(course) {
  setTimeout(() => {
    course.status = 'BUILDING';
    setTimeout(() => {
      const bad = course.packages.find((p) => /==(0\.0\.0|9\.9)$/.test(p));
      if (bad) {
        course.status = 'FAILED';
        course.errorSummary = `${bad} 버전을 찾을 수 없어서 환경을 만들지 못했어요.`;
      } else {
        course.status = 'READY';
        course.entryCode = randomCode();
      }
    }, 4000);
  }, 3000);
}

function send(res, status, body, headers = {}) {
  if (body === undefined) {
    res.writeHead(status, headers).end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }).end(JSON.stringify(body));
}
const fail = (res, status, error) => send(res, status, { error });

function cookiesOf(req) {
  return Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((p) => p.trim().split('='))
      .filter(([k]) => k),
  );
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

const emptyDelete = (containers = 1, volumes = 1) => ({ removedContainers: containers, removedVolumes: volumes, failures: [] });

function handleCourse(req, res, path, body) {
  let m;
  if (path === '/api/courses') {
    if (req.method === 'GET') return send(res, 200, [...courses.values()].sort((a, b) => b.id - a.id).map(courseView));
    if (req.method === 'POST') {
      const { name = '', pythonVersion = '', packages = '' } = parseJson(body);
      if (!name.trim() || name.trim().length > 100) return fail(res, 400, '수업 이름은 1자 이상 100자 이하로 입력해 주세요.');
      if (!/^3\.[0-9]{1,2}(\.[0-9]{1,2})?$/.test(pythonVersion.trim())) return fail(res, 400, '파이썬 버전은 3.12 또는 3.12.4 형식으로 입력해 주세요.');
      const lines = packages.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return fail(res, 400, '패키지를 한 개 이상 입력해 주세요.');
      const course = addCourse({ name: name.trim(), pythonVersion: pythonVersion.trim(), packages: lines, status: 'LOCKING', entryCode: null });
      provision(course);
      return send(res, 201, courseView(course));
    }
  }

  if (!(m = path.match(/^\/api\/courses\/(\d+)(\/.*)?$/))) return send(res, 404);
  const course = courses.get(Number(m[1]));
  if (!course) return fail(res, 404, '수업을 찾을 수 없습니다.');
  const rest = m[2] ?? '';

  if (rest === '') {
    if (req.method === 'GET') return send(res, 200, courseView(course));
    if (req.method === 'DELETE') {
      if (parseJson(body).confirmName !== course.name) return fail(res, 400, '수업 이름이 일치하지 않습니다.');
      if (course.status !== 'ENDED' && course.status !== 'FAILED') return fail(res, 409, '종료됐거나 발급에 실패한 수업만 지울 수 있습니다.');
      const list = sessionsOf(course.id);
      list.forEach((s) => sessions.delete(s.token));
      courses.delete(course.id);
      return send(res, 200, emptyDelete(list.length, list.length));
    }
  }
  if (rest === '/dashboard' && req.method === 'GET') return send(res, 200, dashboardView(course));
  if (rest === '/end' && req.method === 'POST') {
    if (course.status !== 'READY') return fail(res, 409, '준비가 끝난 수업만 종료할 수 있습니다.');
    course.status = 'ENDED';
    const list = sessionsOf(course.id);
    list.forEach((s) => {
      s.containerRunning = false;
      s.ideConnected = false;
    });
    return send(res, 200, { status: 'ENDED', stopped: list.length, failed: 0 });
  }
  if (rest === '/resume' && req.method === 'POST') {
    if (course.status !== 'ENDED') return fail(res, 409, '종료된 수업만 다시 열 수 있습니다.');
    course.status = 'READY';
    const list = sessionsOf(course.id);
    list.forEach((s) => {
      s.containerRunning = true;
    });
    return send(res, 200, { started: list.length, unhealthy: 0, recreatedEmpty: 0, failed: 0 });
  }

  const sm = rest.match(/^\/sessions\/(\d+)(?:\/(resolve|restart|reset-pin))?$/);
  if (!sm) return send(res, 404);
  const s = sessionsOf(course.id).find((x) => x.id === Number(sm[1]));
  if (!s) return fail(res, 404, '이 수업의 학생을 찾을 수 없습니다.');
  if (req.method === 'POST' && sm[2] === 'resolve') {
    s.needsHelp = false;
    s.needsHelpReason = null;
    return send(res, 204);
  }
  if (req.method === 'POST' && sm[2] === 'restart') {
    s.containerRunning = true;
    s.envStatus = 'OK';
    s.issues = [];
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && sm[2] === 'reset-pin') {
    s.pin = null;
    return send(res, 204);
  }
  if (req.method === 'DELETE' && !sm[2]) {
    sessions.delete(s.token);
    return send(res, 200, emptyDelete());
  }
  return send(res, 404);
}

function installInfo(req, os) {
  const origin = `http://${req.headers.host ?? `localhost:${PORT}`}`;
  return {
    diagnoseCommand:
      os === 'macos'
        ? `echo os=macos; echo arch=$(uname -m); echo python=$(python3 -c 'import platform;print(platform.python_version())' 2>/dev/null || echo none)`
        : `"os=windows"; "arch=x86_64"; "python=$(try { python -c 'import platform;print(platform.python_version())' } catch { 'none' })"`,
    installCommand:
      os === 'macos' ? `curl -fsSL "${origin}/l/mock/install.sh" | sh` : `powershell -ExecutionPolicy ByPass -c "irm ${origin}/l/mock/install.ps1 | iex"`,
    scriptUrl: `/l/mock/install.${os === 'macos' ? 'sh' : 'ps1'}`,
    zipUrl: '/api/me/code.zip',
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
}

function handleStudent(req, res, path, query, body) {
  const s = sessions.get(cookiesOf(req).LAB_STUDENT);
  if (!s) return fail(res, 404, '입장 정보를 찾을 수 없습니다.');
  const course = courses.get(s.courseId);

  if (path === '/api/me' && req.method === 'GET') {
    return send(res, 200, {
      name: s.name,
      courseName: course.name,
      courseStatus: course.status,
      envStatus: s.envStatus,
      issues: [],
      issuesText: s.issues,
      needsHelp: s.needsHelp,
      workspaceLost: s.workspaceLost,
      latestHelp: null,
      ideUrl: `http://${(req.headers.host ?? 'localhost').split(':')[0]}:${PORT}/ide/`,
      idePassword: s.pin ?? '0000',
    });
  }
  if (path === '/api/me/logout' && req.method === 'POST') {
    return send(res, 204, undefined, { 'Set-Cookie': 'LAB_STUDENT=; Path=/; Max-Age=0' });
  }
  if (path === '/api/me/local/link' && req.method === 'POST') {
    const os = query.get('os');
    if (os !== 'macos' && os !== 'windows') return fail(res, 400, 'OS는 macOS 또는 Windows 중에서 골라 주세요.');
    return send(res, 200, installInfo(req, os));
  }
  if (path === '/api/me/local/diagnostics' && req.method === 'POST') {
    const { os, text = '' } = parseJson(body);
    const lines = Object.fromEntries(text.trim().split(/\r?\n/).map((l) => l.trim().split('=')));
    if (!lines.os || !lines.arch || !lines.python) return fail(res, 400, '출력 형식이 올바르지 않습니다. 명령이 출력한 세 줄을 그대로 붙여넣어 주세요.');
    if (lines.os !== os) return fail(res, 400, '고른 운영체제와 출력이 다릅니다.');
    s.local = { status: 'DIAGNOSED', os: lines.os, arch: lines.arch, python: lines.python, failed: [] };
    return send(res, 204);
  }
  if (path === '/api/me/local/verify' && req.method === 'POST') {
    const { text = '' } = parseJson(body);
    const ok = /verify=ok/.test(text);
    if (!ok && !/verify=fail/.test(text)) return fail(res, 400, '검증 결과를 찾지 못했습니다. 설치 명령의 출력을 그대로 붙여넣어 주세요.');
    const failed = ok ? [] : (text.match(/failed=(.*)/)?.[1] ?? 'unknown').split(',');
    s.local = { ...s.local, status: ok ? 'OK' : 'FAIL', failed };
    return send(res, 200, {
      ok,
      python: s.local.python,
      passed: ok ? course.packages.length : 0,
      total: course.packages.length,
      failed,
      message: ok ? '내 컴퓨터에 수업과 같은 환경이 설치되었습니다.' : '로컬 설치 검증에 실패했습니다.',
    });
  }
  if (path === '/api/me/code.zip') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('목업 파일입니다.\n');
    return;
  }
  return send(res, 404);
}

const IDE_PAGE = `<!doctype html><meta charset="utf-8"><title>목업 IDE</title><style>
body{margin:0;height:100vh;background:#fff;color:#555;font:14px system-ui;display:flex;align-items:center;justify-content:center}
</style><p>목업 IDE입니다. 실제 서버에 연결하면 code-server가 여기에 뜹니다.</p>`;

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  try {
    if (path.startsWith('/ide/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(IDE_PAGE);
      return;
    }
    if (path.startsWith('/l/')) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('# 목업 스크립트\n');
      return;
    }
    const body = await readBody(req);
    const cookies = cookiesOf(req);
    const isInstructor = instructorCookies.has(cookies.LAB_INSTRUCTOR);

    if (path === '/api/auth/login' && req.method === 'POST') {
      const form = new URLSearchParams(body);
      if (form.get('username') !== INSTRUCTOR.username || form.get('password') !== INSTRUCTOR.password) {
        return fail(res, 401, '아이디 또는 비밀번호를 확인해 주세요.');
      }
      const token = randomId();
      instructorCookies.add(token);
      return send(res, 204, undefined, { 'Set-Cookie': `LAB_INSTRUCTOR=${token}; Path=/; HttpOnly; SameSite=Lax` });
    }
    if (path === '/api/auth/logout' && req.method === 'POST') {
      instructorCookies.delete(cookies.LAB_INSTRUCTOR);
      return send(res, 204, undefined, { 'Set-Cookie': 'LAB_INSTRUCTOR=; Path=/; Max-Age=0' });
    }
    if (path === '/api/auth/me') {
      if (!isInstructor) return fail(res, 401, '로그인이 필요합니다.');
      return send(res, 200, { username: INSTRUCTOR.username });
    }
    if (path.startsWith('/api/courses')) {
      if (!isInstructor) return fail(res, 401, '로그인이 필요합니다.');
      return handleCourse(req, res, path, body);
    }
    if (path === '/api/join' && req.method === 'POST') {
      const { entryCode = '', name = '', pin = '' } = parseJson(body);
      const who = name.trim();
      if (!who || who.length > 30) return fail(res, 400, '이름은 1자 이상 30자 이하로 입력해 주세요.');
      if (!/^[0-9]{4}$/.test(pin)) return fail(res, 400, 'PIN은 숫자 4자리로 입력해 주세요.');
      const course = [...courses.values()].find((c) => c.entryCode === entryCode.trim().toUpperCase());
      if (!course || course.status !== 'READY') return fail(res, 400, '수업 코드를 확인해 주세요. 코드가 없거나 아직 준비되지 않았습니다.');
      let session = sessionsOf(course.id).find((s) => s.name === who);
      const resumed = Boolean(session);
      if (session) {
        if (session.pin === null) session.pin = pin;
        else if (session.pin !== pin) return fail(res, 403, '이미 입장한 이름입니다. PIN을 확인해 주세요.');
      } else {
        await new Promise((r) => setTimeout(r, 800));
        session = addSession(course, who, pin);
      }
      return send(res, resumed ? 200 : 201, { resumed }, { 'Set-Cookie': `LAB_STUDENT=${session.token}; Path=/; HttpOnly; SameSite=Lax` });
    }
    if (path.startsWith('/api/me')) return handleStudent(req, res, path, url.searchParams, body);
    return send(res, 404);
  } catch (e) {
    console.error(`[mock] ${req.method} ${path}`, e);
    if (!res.headersSent) fail(res, 500, '목업 서버가 요청을 처리하지 못했습니다.');
  }
}).listen(PORT, () => {
  if (SEED) seed();
  console.log(`[mock] http://localhost:${PORT}`);
});
