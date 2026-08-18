# P10 Kubernetes manifests

talent-api の Deployment / Service。calendar との内部 API / webhook 経路は overlay で cluster 内 DNS を使う。

```powershell
cd ..\..\pf-cloud-k8s
# 後続で追加する scheduling-talent overlay から起動
```

Compose 単体デモは従来どおり `deploy/compose.yaml`。