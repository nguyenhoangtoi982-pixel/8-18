require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const thuMuc = __dirname;
const thuMucAnh = path.join(thuMuc, 'uploads');
const fileBai = path.join(thuMuc, 'posts.json');
const fileUsers = path.join(thuMuc, 'users.json');
const fileThoiKhoaBieu = path.join(thuMuc, 'timetable.json');
const fileBinhLuan = path.join(thuMuc, 'comments.json');

// Tao cac thu muc va file du lieu neu chua co
if (!fs.existsSync(thuMucAnh)) {
  fs.mkdirSync(thuMucAnh);
}

if (!fs.existsSync(fileBai)) {
  fs.writeFileSync(fileBai, '[]', 'utf8');
}

if (!fs.existsSync(fileUsers)) {
  fs.writeFileSync(fileUsers, '[]', 'utf8');
}

if (!fs.existsSync(fileBinhLuan)) {
  fs.writeFileSync(fileBinhLuan, '[]', 'utf8');
}

if (!fs.existsSync(fileThoiKhoaBieu)) {
  fs.writeFileSync(fileThoiKhoaBieu, JSON.stringify({
    days: [
      'Thứ Hai',
      'Thứ Ba',
      'Thứ Tư',
      'Thứ Năm',
      'Thứ Sáu',
      'Thứ Bảy'
    ],
    periods: 5,
    schedule: {}
  }, null, 2), 'utf8');
}

// Thoi khoa bieu
function docThoiKhoaBieu() {
  return JSON.parse(fs.readFileSync(fileThoiKhoaBieu, 'utf8'));
}

function luuThoiKhoaBieu(data) {
  fs.writeFileSync(
    fileThoiKhoaBieu,
    JSON.stringify(data, null, 2),
    'utf8'
  );
}

// Doc va luu du lieu
function docFile(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (!Array.isArray(data)) {
    throw new Error('Du lieu khong hop le');
  }

  return data;
}

function docBai() {
  return docFile(fileBai);
}

function docUsers() {
  return docFile(fileUsers);
}

function docBinhLuan() {
  return docFile(fileBinhLuan);
}

function luuUsers(users) {
  fs.writeFileSync(fileUsers, JSON.stringify(users, null, 2), 'utf8');
}

function luuBai(posts) {
  fs.writeFileSync(fileBai, JSON.stringify(posts, null, 2), 'utf8');
}

function luuBinhLuan(comments) {
  fs.writeFileSync(
    fileBinhLuan,
    JSON.stringify(comments, null, 2),
    'utf8'
  );
}

// Gui JSON
function guiJSON(res, status, data, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra
  });

  res.end(JSON.stringify(data));
}

// Doc du lieu gui len
function docBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let quaLon = false;

    req.on('data', chunk => {
      size += chunk.length;

      if (size > 8 * 1024 * 1024) {
        quaLon = true;
      } else {
        chunks.push(chunk);
      }
    });

    req.on('end', () => {
      if (quaLon) {
        const loi = new Error('Du lieu qua lon, toi da 8 MB.');
        loi.status = 413;
        return reject(loi);
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        const loi = new Error('Du lieu gui len khong hop le.');
        loi.status = 400;
        reject(loi);
      }
    });

    req.on('error', reject);
  });
}

// Phien dang nhap
const sessions = new Map();
const THOI_HAN_PHien = 7 * 24 * 60 * 60 * 1000;

function layCookie(req, ten) {
  const cookies = (req.headers.cookie || '').split(';');

  for (const cookie of cookies) {
    const viTri = cookie.indexOf('=');

    if (viTri < 0) continue;

    if (cookie.slice(0, viTri).trim() === ten) {
      return cookie.slice(viTri + 1).trim();
    }
  }

  return '';
}

function layUser(req) {
  const sid = layCookie(req, 'sid');
  const session = sessions.get(sid);

  if (!session) return null;

  if (Date.now() > session.expires) {
    sessions.delete(sid);
    return null;
  }

  const users = docUsers();
  const user = users.find(u => u.username === session.username);

  if (!user || user.status !== 'approved') {
    sessions.delete(sid);
    return null;
  }

  return user;
}

function taoCookie(sid) {
  return `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`;
}

function canDangNhap(req, res) {
  const user = layUser(req);

  if (!user) {
    guiJSON(res, 401, {
      error: 'Hay dang nhap bang tai khoan da duoc duyet.'
    });

    return null;
  }

  return user;
}

function canAdmin(req, res) {
  const user = canDangNhap(req, res);

  if (!user) return null;

  if (user.role !== 'admin') {
    guiJSON(res, 403, {
      error: 'Chi admin moi co quyen nay.'
    });

    return null;
  }

  return user;
}

function thongTinUser(user) {
  return {
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
    status: user.status
  };
}

// Xu ly API
async function xuLy(req, res) {
  const url = new URL(req.url, 'http://localhost');

  // Kiem tra tai khoan dang dang nhap
  if (req.method === 'GET' && url.pathname === '/api/me') {
    const user = layUser(req);

    if (!user) {
      return guiJSON(res, 200, { loggedIn: false });
    }

    return guiJSON(res, 200, {
      loggedIn: true,
      user: thongTinUser(user)
    });
  }

  // Dang ky tai khoan cho duyet
  if (req.method === 'POST' && url.pathname === '/api/register') {
    const data = await docBody(req);
    const username = String(data.username || '').trim().toLowerCase();
    const displayName = String(data.displayName || '').trim();
    const password = String(data.password || '');

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return guiJSON(res, 400, {
        error: 'Ten dang nhap phai co 3-20 ky tu: chu thuong, so hoac _.'
      });
    }

    if (!displayName || displayName.length > 40) {
      return guiJSON(res, 400, {
        error: 'Ten hien thi phai co 1-40 ky tu.'
      });
    }

    if (password.length < 10 || password.length > 128) {
      return guiJSON(res, 400, {
        error: 'Mat khau phai co 10-128 ky tu.'
      });
    }

    const users = docUsers();

    if (users.some(u => u.username === username)) {
      return guiJSON(res, 409, {
        error: 'Ten dang nhap nay da duoc su dung.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    users.push({
      id: crypto.randomUUID(),
      username,
      displayName,
      passwordHash,
      role: 'user',
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    luuUsers(users);

    return guiJSON(res, 201, {
      message: 'Da gui yeu cau. Hay cho admin duyet tai khoan.'
    });
  }

  // Dang nhap
  if (req.method === 'POST' && url.pathname === '/api/login') {
    const data = await docBody(req);
    const username = String(data.username || '').trim().toLowerCase();
    const password = String(data.password || '');

    const users = docUsers();
    const user = users.find(u => u.username === username);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return guiJSON(res, 401, {
        error: 'Ten dang nhap hoac mat khau khong dung.'
      });
    }

    if (user.status === 'pending') {
      return guiJSON(res, 403, {
        error: 'Tai khoan dang cho admin duyet.'
      });
    }

    if (user.status !== 'approved') {
      return guiJSON(res, 403, {
        error: 'Tai khoan nay chua duoc phep dang nhap.'
      });
    }

    const sid = crypto.randomBytes(32).toString('hex');

    sessions.set(sid, {
      username: user.username,
      expires: Date.now() + THOI_HAN_PHien
    });

    return guiJSON(res, 200, {
      message: 'Dang nhap thanh cong.',
      user: thongTinUser(user)
    }, {
      'Set-Cookie': taoCookie(sid)
    });
  }

  // Dang xuat
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const sid = layCookie(req, 'sid');
    sessions.delete(sid);

    return guiJSON(res, 200, {
      message: 'Da dang xuat.'
    }, {
      'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
    });
  }

  // Admin xem danh sach dang ky cho duyet
  if (req.method === 'GET' && url.pathname === '/api/admin/pending') {
    if (!canAdmin(req, res)) return;

    const users = docUsers()
      .filter(u => u.status === 'pending')
      .map(u => ({
        username: u.username,
        displayName: u.displayName,
        createdAt: u.createdAt
      }));

    return guiJSON(res, 200, users);
  }

  // Admin duyet hoac tu choi dang ky
  const matchAdmin = url.pathname.match(
    /^\/api\/admin\/users\/([a-z0-9_]{3,20})\/(approve|reject)$/
  );

  if (req.method === 'POST' && matchAdmin) {
    if (!canAdmin(req, res)) return;

    const username = matchAdmin[1];
    const action = matchAdmin[2];
    const users = docUsers();
    const user = users.find(u => u.username === username);

    if (!user || user.status !== 'pending') {
      return guiJSON(res, 404, {
        error: 'Khong tim thay yeu cau dang ky dang cho duyet.'
      });
    }

    user.status = action === 'approve' ? 'approved' : 'rejected';
    user.reviewedAt = new Date().toISOString();

    luuUsers(users);

    return guiJSON(res, 200, {
      message: action === 'approve'
        ? 'Da duyet tai khoan.'
        : 'Da tu choi tai khoan.'
    });
  }

  // Lay danh sach binh luan cua mot bai viet
  const matchBinhLuan = url.pathname.match(
    /^\/api\/posts\/([0-9a-f-]{36})\/comments$/i
  );

  if (req.method === 'GET' && matchBinhLuan) {
    const postId = matchBinhLuan[1];
    const bai = docBai().find(item => item.id === postId);

    if (!bai) {
      return guiJSON(res, 404, {
        error: 'Khong tim thay bai viet.'
      });
    }

    const comments = docBinhLuan()
      .filter(item => item.postId === postId)
      .sort((a, b) => new Date(a.time) - new Date(b.time));

    return guiJSON(res, 200, comments);
  }

  // Tao binh luan hoac tra loi binh luan
  if (req.method === 'POST' && matchBinhLuan) {
    const user = canDangNhap(req, res);
    if (!user) return;

    const postId = matchBinhLuan[1];
    const bai = docBai().find(item => item.id === postId);

    if (!bai) {
      return guiJSON(res, 404, {
        error: 'Khong tim thay bai viet.'
      });
    }

    const data = await docBody(req);
    const content = String(data.content || '').trim();
    const parentId = data.parentId || null;

    if (!content) {
      return guiJSON(res, 400, {
        error: 'Hay nhap noi dung binh luan.'
      });
    }

    if (content.length > 2000) {
      return guiJSON(res, 400, {
        error: 'Binh luan toi da 2000 ky tu.'
      });
    }

    const comments = docBinhLuan();

    if (parentId !== null) {
      const parent = comments.find(item =>
        item.id === parentId && item.postId === postId
      );

      if (!parent) {
        return guiJSON(res, 400, {
          error: 'Binh luan duoc tra loi khong ton tai.'
        });
      }
    }

    const comment = {
      id: crypto.randomUUID(),
      postId,
      parentId,
      username: user.username,
      name: user.displayName || user.username,
      content,
      time: new Date().toISOString()
    };

    comments.push(comment);
    luuBinhLuan(comments);

    return guiJSON(res, 201, comment);
  }

  // Xoa binh luan: chu binh luan hoac admin
  const matchXoaBinhLuan = url.pathname.match(
    /^\/api\/comments\/([0-9a-f-]{36})$/i
  );

  if (req.method === 'DELETE' && matchXoaBinhLuan) {
    const user = canDangNhap(req, res);
    if (!user) return;

    const id = matchXoaBinhLuan[1];
    const comments = docBinhLuan();
    const target = comments.find(item => item.id === id);

    if (!target) {
      return guiJSON(res, 404, {
        error: 'Khong tim thay binh luan.'
      });
    }

    if (
      user.role !== 'admin' &&
      user.username !== target.username
    ) {
      return guiJSON(res, 403, {
        error: 'Ban chi co the xoa binh luan cua minh.'
      });
    }

    // Xoa ca cac cau tra loi ben duoi binh luan
    const idsCanXoa = new Set([id]);
    let coThayDoi = true;

    while (coThayDoi) {
      coThayDoi = false;

      for (const comment of comments) {
        if (
          comment.parentId &&
          idsCanXoa.has(comment.parentId) &&
          !idsCanXoa.has(comment.id)
        ) {
          idsCanXoa.add(comment.id);
          coThayDoi = true;
        }
      }
    }

    const conLai = comments.filter(
      item => !idsCanXoa.has(item.id)
    );

    luuBinhLuan(conLai);

    return guiJSON(res, 200, {
      message: 'Da xoa binh luan.'
    });
  }

  // Admin xoa bai viet
  const matchXoaBai = url.pathname.match(
    /^\/api\/posts\/([0-9a-f-]{36})$/i
  );

  if (req.method === 'DELETE' && matchXoaBai) {
    const user = canAdmin(req, res);
    if (!user) return;

    const id = matchXoaBai[1];
    const danhSach = docBai();
    const viTri = danhSach.findIndex(bai => bai.id === id);

    if (viTri === -1) {
      return guiJSON(res, 404, {
        error: 'Khong tim thay bai viet.'
      });
    }

    const bai = danhSach[viTri];

    danhSach.splice(viTri, 1);
    luuBai(danhSach);

    // Xoa binh luan thuoc bai viet da bi xoa
    const comments = docBinhLuan();
    const commentsConLai = comments.filter(
      item => item.postId !== id
    );
    luuBinhLuan(commentsConLai);

    // Xoa anh dinh kem neu co
    if (bai.image && bai.image.startsWith('/uploads/')) {
      const tenAnh = path.basename(bai.image);
      const duongDanAnh = path.join(thuMucAnh, tenAnh);

      if (fs.existsSync(duongDanAnh)) {
        try {
          fs.unlinkSync(duongDanAnh);
        } catch (error) {
          console.error('Khong xoa duoc anh:', error);
        }
      }
    }

    return guiJSON(res, 200, {
      message: 'Da xoa bai viet.'
    });
  }

  // Xem thoi khoa bieu
  if (req.method === 'GET' && url.pathname === '/api/timetable') {
    return guiJSON(res, 200, docThoiKhoaBieu());
  }

  // Admin cap nhat thoi khoa bieu
  if (req.method === 'PUT' && url.pathname === '/api/timetable') {
    const user = canAdmin(req, res);
    if (!user) return;

    const data = await docBody(req);

    if (
      !data ||
      !Array.isArray(data.days) ||
      data.days.length !== 6 ||
      !Number.isInteger(data.periods) ||
      data.periods < 1 ||
      data.periods > 12 ||
      !data.schedule ||
      typeof data.schedule !== 'object' ||
      Array.isArray(data.schedule)
    ) {
      return guiJSON(res, 400, {
        error: 'Du lieu thoi khoa bieu khong hop le.'
      });
    }

    luuThoiKhoaBieu({
      days: data.days,
      periods: data.periods,
      schedule: data.schedule
    });

    return guiJSON(res, 200, {
      message: 'Da luu thoi khoa bieu.'
    });
  }

  // Danh sach bai viet
  if (req.method === 'GET' && url.pathname === '/api/posts') {
    return guiJSON(res, 200, docBai());
  }

  // Anh da luu
  if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
    const tenFile = path.basename(url.pathname);
    const duongDan = path.join(thuMucAnh, tenFile);

    if (!fs.existsSync(duongDan)) {
      res.writeHead(404);
      return res.end('Khong tim thay anh');
    }

    const loaiAnh = {
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };

    res.writeHead(200, {
      'Content-Type':
        loaiAnh[path.extname(tenFile)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });

    return fs.createReadStream(duongDan).pipe(res);
  }

  // Dang bai: bat buoc dang nhap
  if (req.method === 'POST' && url.pathname === '/api/posts') {
    const user = canDangNhap(req, res);
    if (!user) return;

    const data = await docBody(req);
    const noiDung = String(data.content || '').trim();

    if (!noiDung) {
      return guiJSON(res, 400, {
        error: 'Can nhap noi dung bai viet.'
      });
    }

    if (noiDung.length > 10000) {
      return guiJSON(res, 400, {
        error: 'Noi dung toi da 10000 ky tu.'
      });
    }

    let anh = '';

    if (data.imageData) {
      const match = data.imageData.match(
        /^data:image\/(jpeg|png|gif|webp);base64,([A-Za-z0-9+/=]+)$/
      );

      if (!match) {
        return guiJSON(res, 400, {
          error: 'Anh khong hop le.'
        });
      }

      const duLieuAnh = Buffer.from(match[2], 'base64');

      if (duLieuAnh.length > 5 * 1024 * 1024) {
        return guiJSON(res, 413, {
          error: 'Anh toi da 5 MB.'
        });
      }

      const duoi = match[1] === 'jpeg' ? '.jpg' : '.' + match[1];
      const tenAnh = crypto.randomUUID() + duoi;

      fs.writeFileSync(path.join(thuMucAnh, tenAnh), duLieuAnh);
      anh = '/uploads/' + tenAnh;
    }

    const bai = {
      id: crypto.randomUUID(),
      name: user.displayName || user.username,
      content: noiDung,
      image: anh,
      time: new Date().toISOString()
    };

    const danhSach = docBai();
    danhSach.unshift(bai);
    luuBai(danhSach);

    return guiJSON(res, 201, bai);
  }

  // Giao dien website
  if (
    req.method === 'GET' &&
    (url.pathname === '/' || url.pathname === '/index.html')
  ) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8'
    });

    return fs.createReadStream(
      path.join(thuMuc, 'index.html')
    ).pipe(res);
  }

  res.writeHead(404);
  res.end('Not found');
}

// Khoi dong server
const server = http.createServer((req, res) => {
  xuLy(req, res).catch(error => {
    console.error(error);

    if (!res.headersSent) {
      guiJSON(res, error.status || 500, {
        error: error.status
          ? error.message
          : 'Loi server. Hay kiem tra CMD.'
      });
    } else {
      res.end();
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Website dang chay tren cong ${PORT}`);
});
