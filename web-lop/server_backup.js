
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const thuMuc = __dirname;
const thuMucAnh = path.join(thuMuc, 'uploads');
const fileDuLieu = path.join(thuMuc, 'posts.json');

if (!fs.existsSync(thuMucAnh)) {
  fs.mkdirSync(thuMucAnh);
}

if (!fs.existsSync(fileDuLieu)) {
  fs.writeFileSync(fileDuLieu, '[]', 'utf8');
}

function docBai() {
  try {
    return JSON.parse(fs.readFileSync(fileDuLieu, 'utf8'));
  } catch {
    return [];
  }
}

function guiJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Lay danh sach bai viet
  if (req.method === 'GET' && url.pathname === '/api/posts') {
    return guiJSON(res, 200, docBai());
  }

  // Hien thi anh da luu
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
      'Content-Type': loaiAnh[path.extname(tenFile)] || 'application/octet-stream'
    });

    return fs.createReadStream(duongDan).pipe(res);
  }

  // Nhan bai viet moi
  if (req.method === 'POST' && url.pathname === '/api/posts') {
    let body = '';
    let quaLon = false;

    req.on('data', chunk => {
      body += chunk.toString();

      if (Buffer.byteLength(body, 'utf8') > 8 * 1024 * 1024) {
        quaLon = true;
      }
    });

    req.on('end', () => {
      if (quaLon) {
        return guiJSON(res, 413, { error: 'Du lieu qua lon, hay chon anh nho hon.' });
      }

      try {
        const data = JSON.parse(body);
        const ten = String(data.name || '').trim();
        const noiDung = String(data.content || '').trim();

        if (!ten || !noiDung) {
          return guiJSON(res, 400, { error: 'Can nhap ten va noi dung.' });
        }

        let anh = '';

        if (data.imageData) {
          const match = data.imageData.match(
            /^data:image\/(jpeg|png|gif|webp);base64,([A-Za-z0-9+/=]+)$/
          );

          if (!match) {
            return guiJSON(res, 400, { error: 'Anh khong hop le.' });
          }

          const duLieuAnh = Buffer.from(match[2], 'base64');

          if (duLieuAnh.length > 5 * 1024 * 1024) {
            return guiJSON(res, 413, { error: 'Anh toi da 5 MB.' });
          }

          const duoi = match[1] === 'jpeg' ? '.jpg' : '.' + match[1];
          const tenAnh = crypto.randomUUID() + duoi;

          fs.writeFileSync(path.join(thuMucAnh, tenAnh), duLieuAnh);
          anh = '/uploads/' + tenAnh;
        }

        const bai = {
          id: crypto.randomUUID(),
          name: ten,
          content: noiDung,
          image: anh,
          time: new Date().toISOString()
        };

        const danhSach = docBai();
        danhSach.unshift(bai);
        fs.writeFileSync(fileDuLieu, JSON.stringify(danhSach, null, 2), 'utf8');

        return guiJSON(res, 201, bai);
      } catch {
        return guiJSON(res, 400, { error: 'Du lieu gui len khong hop le.' });
      }
    });

    return;
  }

  // Tra ve giao dien website
  if (req.method === 'GET' &&
      (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8'
    });

    return fs.createReadStream(path.join(thuMuc, 'index.html')).pipe(res);
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3000, '127.0.0.1', () => {
  console.log('Website dang chay tai http://localhost:3000');
});
