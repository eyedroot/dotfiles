---
name: kubectl-guard
description: kubectl(또는 helm, kustomize 같은 Kubernetes CLI) 명령을 실행하거나 제안하기 전에 반드시 적용한다. 클러스터 상태를 바꾸는 명령(apply, delete, scale, rollout restart, patch, edit, exec, config use-context 등)은 대상 컨텍스트와 영향 범위를 적어 사용자 승인을 받은 뒤에만 실행하고, get·describe·logs 같은 조회 명령은 승인 없이 실행하되 어느 클러스터에 붙어 있는지 먼저 확인한다. 컨텍스트 이름만으로 운영 클러스터인지 판단할 수 없으면 사용자에게 묻는다. "파드 재시작해줘", "deployment 스케일 올려줘", "k8s 설정 바꿔줘", "클러스터 상태 봐줘", "pod 로그 확인", "쿠버네티스에 배포" 같은 요청에, 그리고 사용자가 kubectl을 입에 올리지 않았더라도 작업이 Kubernetes 클러스터에 닿는 순간 사용한다.
---

# kubectl 변경 명령 승인 절차

kubectl은 로컬 kubeconfig의 현재 컨텍스트로 조용히 붙는다. 같은 `rollout restart` 한 줄이 개발 클러스터에서는 사소한 일이고 운영 클러스터에서는 장애다. 에이전트는 지금 어느 클러스터에 붙어 있는지, 그 클러스터가 운영인지 사용자만큼 알지 못한다. 그래서 kubectl 명령을 실행하기 전에 두 가지를 먼저 정한다.

1. 이 명령이 클러스터 상태를 바꾸는가.
2. 대상 클러스터가 운영 클러스터인가, 아니면 판단할 수 없는가.

상태를 바꾸는 명령은 환경과 무관하게 사용자 승인을 받은 뒤에만 실행한다. 조회 명령은 승인 없이 실행하되 대상 컨텍스트를 확인하고 응답에 밝힌다.

## 세션 시작: 대상 컨텍스트 확인

첫 kubectl 명령 전에 아래를 실행해 지금 붙어 있는 클러스터와 네임스페이스를 안다. 이 두 명령은 로컬 파일만 읽는다.

```bash
kubectl config current-context
kubectl config get-contexts
```

- 사용자가 `--context`, `--kubeconfig`, `KUBECONFIG`를 바꾸거나 다른 터미널을 언급하면 다시 확인한다.
- 사용자의 말과 실제 컨텍스트가 어긋나면 멈추고 묻는다. 예: 사용자는 "dev에서"라고 했는데 현재 컨텍스트 이름에 dev가 없다. 이때 "dev로 바꿔서 실행하겠습니다"라고 알아서 넘어가지 않는다. 어떤 컨텍스트를 쓸지는 사용자가 정한다.
- 변경 명령에는 항상 `--context <이름>`과 `-n <네임스페이스>`를 명시한다. `kubectl config use-context`는 사용자의 다른 터미널까지 영향을 주는 로컬 설정 변경이므로 변경 명령으로 취급한다.
- 응답 첫 줄에 어느 컨텍스트와 네임스페이스를 대상으로 했는지 적는다. 사용자가 다른 클러스터를 생각하고 있었다면 이 한 줄에서 잡힌다.

## 명령 분류

기준은 "클러스터나 그 안의 워크로드, 또는 로컬 kubeconfig의 상태가 바뀌는가"다. 아래 조회 목록에 없는 명령은 변경 명령으로 본다.

| 분류 | 명령 | 처리 |
| --- | --- | --- |
| 조회 | `get`, `describe`, `logs`, `top`, `events`, `explain`, `api-resources`, `api-versions`, `version`, `cluster-info`, `auth can-i`, `auth whoami`, `rollout status`, `rollout history`, `diff`, `config view`, `config get-contexts`, `config current-context`, `--dry-run=client` 또는 `--dry-run=server`가 붙은 명령, `helm list`, `helm get`, `helm status`, `helm diff`, `kustomize build` 결과를 파일로만 쓰는 경우 | 승인 없이 실행 |
| 변경 | `apply`, `create`, `replace`, `patch`, `edit`, `delete`, `scale`, `autoscale`, `rollout restart`, `rollout undo`, `rollout pause`, `rollout resume`, `set`, `label`, `annotate`, `taint`, `cordon`, `drain`, `uncordon`, `expose`, `run`, `debug`, `certificate approve`, `certificate deny`, `config use-context`, `config set-*`, `config delete-*`, `config rename-context`, `helm install`, `helm upgrade`, `helm rollback`, `helm uninstall`, 파이프 끝이 `kubectl apply`나 `kubectl delete`인 모든 명령 | 승인 후 실행 |
| 회색 | `exec`, `attach`, `cp`, `port-forward`, `proxy` | 승인 후 실행 |

회색 명령을 승인 대상으로 두는 이유: `exec`는 안에서 어떤 명령이든 실행할 수 있어 "읽기만 한다"는 보장을 에이전트가 할 수 없고, `port-forward`는 로컬에서 운영 서비스로 바로 트래픽을 보내는 통로를 연다. 사용자가 "이 파드에서 `cat /etc/config`만 보면 돼"라고 특정했다면 그 명령 한 번에 대한 승인으로 충분하다.

조회 명령이라도 결과에 민감한 값이 섞일 수 있다. `get secret -o yaml`, `exec ... env`, `config view`(토큰 포함)의 출력은 값을 가린 채 보고한다.

## 운영 클러스터 판단

변경 명령 승인을 요청할 때는 대상 클러스터가 운영인지에 대한 판단과 근거를 같이 적는다. 판단 순서는 아래와 같다.

1. 사용자가 `$HOME/.kube/cluster-environments` 파일에 적어 둔 분류가 있으면 그것을 따른다. 이 파일은 기기별 설정이라 dotfiles에 올리지 않는다. 한 줄에 `<컨텍스트 이름> <prod|stage|dev|local> [메모]` 순서로 적고, `#`으로 시작하는 줄은 주석이다. 파일이 없으면 2번으로 간다.
2. 컨텍스트, 클러스터, 사용자, 네임스페이스 이름에 `dev`, `stage`, `stg`, `test`, `qa`, `sandbox`, `local`, `minikube`, `kind`, `docker-desktop` 같은 비운영 표시가 있으면 비운영으로 본다. `prod`, `prd`, `live`, `production`, `real`, `운영`은 운영 표시다.
3. 둘 다 없으면 "판단 불가"다. 비운영 표시가 없다는 사실은 비운영의 근거가 아니다. 고객사 이름이나 지역 이름만 붙은 컨텍스트는 대개 운영이다. 이때는 승인 요청에 "이 컨텍스트가 운영 클러스터인지 알 수 없습니다"라고 적고 사용자에게 환경을 확인받는다. 확인받은 뒤에는 `$HOME/.kube/cluster-environments`에 한 줄 추가할지 제안해서 다음 세션에 같은 질문을 반복하지 않게 한다.

네임스페이스 목록이나 ingress 호스트 같은 클러스터 안의 정보는 근거를 보강하는 데만 쓰고, 그것만으로 운영 여부를 단정하지 않는다.

## 승인 요청 형식

변경 명령이 필요하면 아래 내용을 적고 턴을 끝낸다. 사용자가 답하기 전에는 실행하지 않는다. 같은 턴 안에서 "승인 요청"을 적어 놓고 이어서 실행하는 것은 승인이 아니다. 도구 권한 프롬프트(Bash 실행 허용 여부)도 승인이 아니다. 사용자가 Bash를 자동 허용해 두었을 수 있으므로 반드시 대화에서 묻는다. 질문 도구(AskUserQuestion, request_user_input)가 있으면 그것을 써도 되고, 없으면 본문에 적는다.

```
대상: 컨텍스트 <이름> / 네임스페이스 <이름> / 환경 판단: <운영|비운영|판단 불가> (<근거>)
실행할 명령:
  kubectl --context <이름> -n <네임스페이스> rollout restart deployment/<이름>
영향: <어떤 리소스가 어떻게 바뀌는지, 파드가 재시작되는지, 요청이 끊기는 구간이 있는지>
되돌리기: <롤백 명령 또는 "되돌릴 수 없음">
실행 전 준비: <현재 상태 저장 명령, diff 확인 결과>
이대로 실행할까요?
```

- 명령은 실제로 실행할 문자열 그대로 적는다. `--context`와 `-n`을 뺀 채 승인받고 나중에 붙이지 않는다.
- `apply`는 승인 요청 전에 `kubectl diff -f <파일>`을 돌려 실제 바뀌는 필드를 영향 항목에 요약한다. diff가 비어 있으면 그 사실을 적고 실행할 필요가 없다고 말한다.
- 되돌릴 수 있는 명령은 되돌리기 전에 상태를 남긴다. 예: `kubectl get deploy <이름> -o yaml > <스크래치 디렉터리>/before.yaml`. `delete`처럼 되돌릴 수 없는 명령은 그 사실을 되돌리기 항목에 적는다.
- 여러 명령을 한 번에 승인받아도 된다. 순서대로 전부 나열하고, 실행 도중 하나가 실패하면 멈추고 보고한다.

## 승인의 범위

- 승인은 적어 둔 명령과 대상에만 유효하다. 리소스, 네임스페이스, 컨텍스트, 명령 종류 중 하나라도 달라지면 다시 묻는다. 조회 결과를 보고 "그러면 이것도 같이"가 떠올라도 새 승인이 필요하다.
- 사용자가 "이 세션에서 tk-dev는 묻지 말고 해"처럼 범위를 넓혀 주면 그 컨텍스트와 그 세션 안에서는 따른다. 그래도 실행한 변경 명령은 응답에 컨텍스트와 함께 한 줄씩 남긴다. 운영 클러스터에 대해 같은 요청을 받으면 우려를 한 번 말한 뒤 사용자가 다시 확인하면 따른다.
- 사용자가 승인하지 않거나 답이 없으면 명령을 실행하지 않고 끝낸다. "승인된 것으로 간주"는 없다.

## 실행 후

- 변경 명령 뒤에는 결과를 확인하는 조회 명령을 바로 돌린다. 예: `rollout status`, `get pods`. 실행했다는 사실이 아니라 관찰한 상태를 보고한다.
- 실행한 명령, 대상 컨텍스트, 확인 결과, 남겨 둔 복구 파일 위치를 응답에 적는다.
- 예상과 다른 결과가 나오면 추가 변경으로 수습하지 말고 상태를 보고하고 다음 조치를 승인받는다.

## 예시

**조회 요청.** "지금 클러스터에 CrashLoop 도는 파드 있어?"
`kubectl config current-context`로 컨텍스트를 확인한 뒤 `kubectl --context <이름> get pods -A`를 바로 실행한다. 응답은 "컨텍스트 `tk-stage` 기준"으로 시작하고 결과를 적는다.

**변경 요청, 환경 판단 불가.** "nginx 재시작해줘" (현재 컨텍스트 `hq-webtech`, 분류 파일 없음)
컨텍스트 이름에 환경 표시가 없다. 승인 요청 형식대로 적되 환경 판단을 "판단 불가"로 두고, 운영 클러스터인지 사용자에게 확인한다. 답이 올 때까지 실행하지 않는다.

**사용자의 말과 컨텍스트가 어긋남.** "dev에서 api replica 3으로 올려줘" (현재 컨텍스트 `hq-webtech`, `tk-dev`는 목록에 있음)
현재 컨텍스트가 dev가 아니라는 점과 `tk-dev`가 있다는 점을 알리고, `tk-dev`를 대상으로 할지 확인한다. 확인되면 `kubectl --context tk-dev -n <네임스페이스> scale deployment/api --replicas=3`을 승인 요청 형식으로 적는다. 컨텍스트 확인과 scale 승인은 한 번의 질문에 같이 담아도 된다.
