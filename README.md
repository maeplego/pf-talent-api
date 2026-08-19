# pf-talent-api

P10 talent-platform API（学習用）です。  
求人・応募の最小フローと、P05 `calendar.booking.confirmed` webhook 受信で応募ステータスを `interview` に進める結合点を実装しています。

永続化は Compose / overlay では Postgres。単体テストは `MemoryStore`。

求人検索は OpenSearch ではなく Postgres の `tsvector` + `pg_trgm`（メモリ時は部分一致）。類似求人は P07、失敗時は skills overlap。

## 起動

```powershell
npm install
npm run start
```

- `http://localhost:8090/health`

`TALENT_DATABASE_URL` が空ならメモリ（再起動で消える）。Compose では専用 Postgres を使う。

## 起動（Compose）

```powershell
cd deploy
copy .env.example .env
docker compose up -d --build
```

- `http://localhost:8090/health`
- 製品専用 Postgres はホスト `localhost:5436`（DB/user `talent`）

連携 overlay C では platform Postgres の DB 名 `talent`（`ensure-platform-databases.ps1` / `init-databases.sql`）。接続文字列は `p10-secrets` の `TALENT_DATABASE_URL`。

overlay の web は OIDC 必須。API は `TALENT_DEV_AUTH=true` のまま `X-Dev-User-Sub` を受け付け、Bearer も検証する（cluster-smoke 用）。

## テスト

```powershell
npm test
```

Postgres 結合は `TALENT_DATABASE_URL` が届くときだけ走る。

起動時、空のストアなら架空求人 10 件をシードする（実在企業名は使わない）。追加投入は `POST /v1/dev/seed`。

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


