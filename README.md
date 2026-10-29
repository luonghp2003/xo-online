# X-O Online 2 người

Game Tic-Tac-Toe realtime theo phòng, dùng Node.js, Express và Socket.IO.

## Tính năng

- Tạo phòng tự động với mã 6 ký tự.
- Người tạo phòng là X, người thứ hai là O.
- Chia sẻ link có sẵn mã phòng.
- Đồng bộ nước đi realtime bằng WebSocket/Socket.IO.
- Tự kiểm tra thắng, hòa và tô 3 ô chiến thắng.
- Chơi lại khi cả 2 người cùng xác nhận.
- Tự nối lại phiên người chơi sau khi mạng chập chờn hoặc refresh trang.
- Responsive cho điện thoại và máy tính.
- Có Dockerfile và render.yaml để triển khai.

## Chạy trên máy

Yêu cầu Node.js 18 trở lên.

```bash
npm install
npm start
```

Mở: http://localhost:3000

Để thử 2 người trên cùng máy, mở bằng 2 trình duyệt khác nhau hoặc cửa sổ thường + cửa sổ riêng tư.

## Đẩy lên GitHub

```bash
git init
git add .
git commit -m "XO online first version"
git branch -M main
git remote add origin https://github.com/USERNAME/xo-online.git
git push -u origin main
```

## Deploy Render

1. Đẩy dự án lên GitHub.
2. Trong Render, tạo Web Service từ repository đó.
3. Build command: `npm install`
4. Start command: `npm start`
5. Health check: `/health`

Bạn cũng có thể dùng file `render.yaml` trong dự án để cấu hình nhanh.

## Deploy bằng Docker

```bash
docker build -t xo-online .
docker run --rm -p 3000:3000 xo-online
```

## Lưu ý production

Phiên bản này lưu phòng trong RAM của một server Node.js. Nó phù hợp cho demo, nhóm nhỏ và một instance server. Nếu cần chạy nhiều instance hoặc lượng người chơi lớn, nên lưu trạng thái phòng/phiên vào Redis và dùng Socket.IO Redis adapter.
