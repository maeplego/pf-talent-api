# Kubernetes マニフェスト（P10 API）

求人 API です。画面は `pf-talent-web/deploy/k8s/` です。このフォルダだけを apply しないでください。起動は [pf-cloud-k8s](https://github.com/maeplego/pf-cloud-k8s) の scheduling-talent overlay からです。

- `talent.localhost` → Web
- `talent-api.localhost` → API

Postgres は platform の DB 名 `talent` です。カレンダーとの内部通信はクラスタ内 DNS です。単体デモは `deploy/compose.yaml` です。
