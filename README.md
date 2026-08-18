# pf-talent-api

P10 talent-platform API（学習用）です。  
求人・応募の最小フローと、P05 `calendar.booking.confirmed` webhook 受信で応募ステータスを `interview` に進める結合点を実装しています。

## 起動

```powershell
npm install
npm run start
```

- `http://localhost:8090/health`

## 起動（Compose）

```powershell
cd deploy
copy .env.example .env
docker compose up -d --build
```

- `http://localhost:8090/health`

## テスト

```powershell
npm test
```

## 主要エンドポイント

- `POST /v1/jobs`
- `POST /v1/jobs/:id/applications`
- `PUT /v1/applications/:id/calendar-link`
- `PATCH /v1/applications/:id/status`
- `GET /v1/applications/:id`
- `POST /webhooks/calendar` (`X-Calendar-Event-Type: calendar.booking.confirmed`)

## P05 連携メモ

- P05 の `event_type.externalRef` と、P10 の `application.calendarExternalRef` を同じ値にして紐付ける
- `calendar.booking.confirmed` を受けると対象応募を `interview` に更新


