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

起動時に架空求人 10 件をシードする（実在企業名は使わない）。追加投入は `POST /v1/dev/seed`。

## 主要エンドポイント

- `GET /v1/jobs` / `GET /v1/jobs/:id` / `GET /v1/jobs/facets`
- `GET /v1/employers/:sub/jobs`（`X-Dev-User-Sub` 一致必須）
- `POST /v1/jobs`
- `POST /v1/jobs/:id/applications`
- `GET /v1/jobs/:id/applications`（当該 employer のヘッダ必須、他社は 403）
- `GET /v1/candidates/:sub/applications`（当該 candidate のヘッダ必須）
- `PUT /v1/applications/:id/calendar-link`
- `PATCH /v1/applications/:id/status`
- `GET /v1/applications/:id`
- `POST /webhooks/calendar` (`X-Calendar-Event-Type: calendar.booking.confirmed`)

## P05 ↔ P10 連携デモ

P05 calendar と組み合わせた予約確定→面接ステータス更新デモの手順は `project/portfolio-plan/integration-demo.md` の「P05 ↔ P10」節を参照。

## P05 連携メモ

- P05 の `event_type.externalRef` と、P10 の `application.calendarExternalRef` を同じ値にして紐付ける
- `calendar.booking.confirmed` を受けると対象応募を `interview` に更新


