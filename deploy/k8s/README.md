# P10 Kubernetes manifests

talent-api の Deployment / Service。web は兄弟 `pf-talent-web/deploy/k8s/`。

Ingress（`pf-cloud-k8s`）:

- `talent.localhost` → web
- `talent-api.localhost` → API

calendar との内部 API / webhook 経路は overlay で cluster 内 DNS を使う。

```powershell
cd ..\..\pf-cloud-k8s
.\scripts\cluster-smoke-c-scheduling-talent.ps1
```

Compose 単体デモは従来どおり `deploy/compose.yaml`。
