
const fs = require('fs');
const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const file = 'users.json';

async function main() {
  let users = [];

  if (fs.existsSync(file)) {
    users = JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  if (users.some(user => user.username === 'admin')) {
    console.log('Tai khoan admin da ton tai.');
    rl.close();
    return;
  }

  rl.question('Nhap mat khau admin: ', async password => {
    if (password.length < 10) {
      console.log('Mat khau phai co it nhat 10 ky tu.');
      rl.close();
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    users.push({
      id: 'admin',
      username: 'admin',
      passwordHash: passwordHash,
      role: 'admin',
      status: 'approved'
    });

    fs.writeFileSync(file, JSON.stringify(users, null, 2), 'utf8');
    console.log('Da tao tai khoan admin thanh cong!');
    rl.close();
  });
}

main().catch(error => {
  console.error('Loi:', error.message);
  rl.close();
});
