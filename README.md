# pf-talent-api

学習用の求人マッチング API です。求人の作成と検索、応募、カレンダー予約確定 webhook で応募を `interview` にする、までを実装しています。**本番 ATS の置き換えではありません。**

検索は OpenSearch ではなく Postgres の全文検索（単体テスト時は部分一致）です。類似求人は [pf-recommend](https://github.com/maeplego/pf-recommend) を呼び、失敗時は skills の重なりに戻します。

画面は [pf-talent-web](https://github.com/maeplego/pf-talent-web) です。

## 起動

```powershell
cd deploy
copy .env.example .env
docker compose up -d --build
```

- http://localhost:8091/health
- ホストの Postgres は `localhost:5436`（ユーザー / DB 名 `talent`）

ホストだけで動かすときは `npm install` のあと `npm run start` です。`TALENT_DATABASE_URL` が空ならメモリ（再起動で消えます）。

空のストアなら、架空求人 10 件をシードします。実在企業名は使いません。

## テスト

```powershell
npm test
```

Postgres 結合は接続先があるときだけ走ります。

## 主な HTTP

- 求人: `GET/POST /v1/jobs`、ファセット、雇用者ごとの一覧
- 応募: `POST /v1/jobs/:id/applications`、候補者 / 雇用者ごとの一覧、ステータス更新
- webhook: `POST /webhooks/calendar`（`calendar.booking.confirmed`）

カレンダー連携では、イベントタイプの `externalRef` と応募の `calendarExternalRef` を同じ値にします。

設計の詳細は [portfolio-plan](https://github.com/maeplego/portfolio-plan) の `portfolio-plan/talent-platform/docs/` です。
