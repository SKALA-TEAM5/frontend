# Frontend Kubernetes Deployment

This deploys the Next.js frontend image to the team namespace.

## Image

```text
amdp-registry.skala-ai.com/skala26a-ai2/team5-frontend:latest
```

## Apply

Create the image pull secret once:

```bash
kubectl create secret docker-registry team5-harbor-secret \
  --namespace=skala3-finalproj-class2-team5 \
  --docker-server=amdp-registry.skala-ai.com \
  --docker-username='robot$skala26a-ai2' \
  --docker-password='<harbor-password>' \
  --dry-run=client \
  -o yaml | kubectl apply -f -
```

Deploy the frontend:

```bash
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml
kubectl rollout status deployment/team5-frontend -n skala3-finalproj-class2-team5
```

Check the workload:

```bash
kubectl get pods,svc,deploy -n skala3-finalproj-class2-team5 -l app=team5-frontend
kubectl logs deployment/team5-frontend -n skala3-finalproj-class2-team5
```

Open it locally:

```bash
kubectl port-forward svc/team5-frontend 3000:3000 -n skala3-finalproj-class2-team5
```

Then open:

```text
http://localhost:3000
```
