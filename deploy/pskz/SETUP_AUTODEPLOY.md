# Автодеплой без входа на сервер

После настройки: **push в `main` → сайт на проде обновляется сам** (GitHub Actions).

Разовая настройка (один раз).

## 1. Ключ для деплоя

На своём Mac:

```bash
ssh-keygen -t ed25519 -C "github-deploy-tmk-landing" -f ~/.ssh/tmk_landing_deploy -N ""
```

Публичный ключ добавьте на сервер (один раз зайдя по SSH):

```bash
ssh root@185.146.3.124
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'СЮДА_СОДЕРЖИМОЕ_~/.ssh/tmk_landing_deploy.pub' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
exit
```

Проверка с Mac:

```bash
ssh -i ~/.ssh/tmk_landing_deploy root@185.146.3.124 'echo OK'
```

## 2. Secrets в GitHub

Репозиторий: `amethysttttt/tmk-vidimost-landing`  
Settings → Secrets and variables → Actions → New repository secret:

| Secret | Значение |
|---|---|
| `DEPLOY_HOST` | `185.146.3.124` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | **весь** файл `~/.ssh/tmk_landing_deploy` (приватный ключ, включая `BEGIN`/`END`) |
| `DEPLOY_PATH` | `/var/www/tmk-landing` (можно не создавать — такой путь по умолчанию) |

Через CLI:

```bash
cd tmk-vidimost-landing
gh secret set DEPLOY_HOST --body '185.146.3.124' --repo amethysttttt/tmk-vidimost-landing
gh secret set DEPLOY_USER --body 'root' --repo amethysttttt/tmk-vidimost-landing
gh secret set DEPLOY_SSH_KEY < ~/.ssh/tmk_landing_deploy --repo amethysttttt/tmk-vidimost-landing
gh secret set DEPLOY_PATH --body '/var/www/tmk-landing' --repo amethysttttt/tmk-vidimost-landing
```

## 3. Как выкатывать дальше

```bash
git add -A && git commit -m "..." && git push origin main
```

Или вручную: Actions → **Deploy to production** → Run workflow.

`.env` на сервере Actions **не перезаписывает**.

## 4. SSL (ошибка сертификата в Chrome)

Отдельно от деплоя, один раз на сервере:

```bash
sudo certbot --nginx -d ai.tmk-technohorizon.kz
```

DNS: A-запись `ai` → `185.146.3.124`.
