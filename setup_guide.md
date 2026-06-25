# Antigravity Remote Backend — Руководство по развёртыванию и подключению Android-приложения

## Содержание
- [Быстрый старт](#быстрый-старт)
- [Подключение Android-приложения](#подключение-android-приложения)
- [Настройка брандмауэра Windows](#настройка-брандмауэра-windows)
- [Управление процессом сервера](#управление-процессом-сервера)
- [Типичные ошибки и решения](#типичные-ошибки-и-решения)

---

## Быстрый старт

```bash
cd /path/to/antigravity-remote-backend
npm install
npm run build
node dist/index.js
```

При запуске сервер выведет в консоль:
```
=================================================
🚀 Antigravity Remote Backend is RUNNING
=================================================

📱 Enter these settings in your Android App:

   IP Address : <ваш IP>
   Port       : 8081

=================================================

🔑 PAIRING CODE: 418824
   (Enter this code in the Android App)
=================================================
```

> [!IMPORTANT]
> **Код сопряжения ротируется каждые 5 минут.** Если код не подошёл — посмотрите актуальный в логах сервера.

---

## Подключение Android-приложения

### Шаг 1: Узнайте IP-адрес сервера

Сервер автоматически определяет IP. Если используется **Tailscale**, будет показан Tailscale IP (формат `100.x.x.x`). Иначе — локальный IP.

### Шаг 2: Введите настройки в приложение

В Android-приложении на экране подключения введите:
- **IP Address** — IP из консоли сервера
- **Port** — `8081` (по умолчанию)

### Шаг 3: Введите 6-значный код

Введите код, показанный в консоли, и нажмите **Connect**.

---

## Настройка брандмауэра Windows

> [!CAUTION]
> **Это обязательный шаг!** Без него Android-приложение не сможет подключиться — вы будете получать ошибку `Connection failed: failed to connect after 5000ms`.

### Откройте PowerShell от имени администратора и выполните:

```powershell
New-NetFirewallRule -DisplayName "Antigravity Backend 8081" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow
```

### Проверка правила:

```powershell
Get-NetFirewallRule -DisplayName "Antigravity Backend 8081"
```

> [!NOTE]
> Правило создаётся **один раз** и сохраняется после перезагрузки. Повторно выполнять не нужно.

### Если используете Tailscale

Убедитесь, что:
1. Tailscale установлен и подключён на **обоих** устройствах (сервер + телефон)
2. Оба устройства видят друг друга в Tailscale Admin Console
3. ACL-правила Tailscale разрешают трафик между устройствами

---

## Управление процессом сервера

### Рекомендуемый способ: прямой запуск

```bash
node dist/index.js
```

### С PM2 (для автоматического перезапуска)

```bash
# Первый запуск
npx pm2 start dist/index.js --name "antigravity-backend"

# Просмотр логов (включая код сопряжения)
npx pm2 logs antigravity-backend --nostream --lines 50

# Перезапуск после изменений
npm run build
npx pm2 restart antigravity-backend

# Остановка
npx pm2 stop antigravity-backend
```

> [!WARNING]
> **PM2 на Windows может быть нестабилен.** PM2-демон может "умирать" между вызовами команд. Если `npx pm2 status` показывает пустую таблицу — демон перезапустился и потерял процесс. В таком случае используйте прямой запуск.

### Просмотр PM2-логов напрямую

Если `npx pm2 logs` не показывает данные, логи хранятся в:
```
%USERPROFILE%\.pm2\logs\antigravity-backend-out.log   # stdout
%USERPROFILE%\.pm2\logs\antigravity-backend-error.log  # stderr
```

---

## Типичные ошибки и решения

### ❌ `Connection failed: failed to connect after 5000ms`

**Причина:** Телефон не может дотянуться до сервера.

**Решения (проверяйте по порядку):**

1. **Брандмауэр Windows** — самая частая причина. [Добавьте правило](#настройка-брандмауэра-windows).

2. **Сервер не запущен** — проверьте:
   ```powershell
   netstat -ano | Select-String ":8081"
   ```
   Если нет строки с `LISTENING` — сервер не слушает порт.

3. **Порт занят другим процессом** — см. [EADDRINUSE](#-error-listen-eaddrinuse-address-already-in-use-00008081).

4. **Разные сети** — если используете Tailscale, убедитесь, что оба устройства подключены. Если локальная сеть — телефон и сервер должны быть в одной Wi-Fi.

---

### ❌ `401 Unauthorized` / `Invalid or expired pairing code`

**Причина:** Код сопряжения не совпадает.

**Решения:**

1. **Код протух** — ротация каждые 5 минут. Посмотрите актуальный код в логах:
   ```powershell
   # Прямой запуск — код в консоли
   # PM2 — в логах:
   Select-String "PAIRING CODE" "$env:USERPROFILE\.pm2\logs\antigravity-backend-out.log" | Select-Object -Last 1
   ```

2. **Запущена старая версия кода** — если эндпоинт `/api/pair` отсутствует, сервер вернёт 404. Пересоберите:
   ```bash
   npm run build
   ```

---

### ❌ `404 Not Found`

**Причина:** Маршрут `/api/pair` не зарегистрирован в сервере.

**Решение:**
```bash
git pull origin master
npm install
npm run build
# Перезапустите сервер
```

---

### ❌ `Error: listen EADDRINUSE: address already in use 0.0.0.0:8081`

**Причина:** Порт 8081 уже занят другим процессом.

**Решение:**

1. Найдите процесс, занимающий порт:
   ```powershell
   netstat -ano | Select-String ":8081"
   # Запишите PID из последней колонки (например, 16672)
   ```

2. Проверьте, что это за процесс:
   ```powershell
   Get-CimInstance Win32_Process -Filter "ProcessId = 16672" | Select-Object ProcessId, CommandLine
   ```

3. Убейте его:
   ```powershell
   Stop-Process -Id 16672 -Force
   ```

4. **Проверьте наличие watchdog-скриптов!** Иногда на сервере запущен PowerShell-сторож, который автоматически перезапускает старую версию:
   ```powershell
   # Найти watchdog-процессы
   Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "while.*node" } | Select-Object ProcessId, CommandLine
   ```
   Убейте их тоже, иначе старый процесс будет воскресать.

> [!WARNING]
> **Watchdog + PM2 = конфликт!** Если на сервере настроен watchdog-скрипт (`while ($true) { node dist/index.js; ... }`), и вы одновременно используете PM2 — они будут конкурировать за порт 8081. Используйте **что-то одно**.

---

### ❌ WebSocket подключается, но данные не загружаются

Проверьте логи сервера на наличие ошибок:
```powershell
# PM2
Get-Content "$env:USERPROFILE\.pm2\logs\antigravity-backend-error.log" -Tail 50

# Или прямой запуск — ошибки выводятся в консоль
```

---

## Переменные окружения (.env)

Файл `.env` в корне проекта. Основные переменные:

| Переменная | Описание | По умолчанию |
|---|---|---|
| `PORT` | Порт HTTP-сервера | `8081` |
| `HOST` | Адрес привязки | `0.0.0.0` |
| `JWT_SECRET` | Секрет для подписи JWT-токенов | Авто-генерация |
| `ADMIN_LOGIN` | Логин админа | — |
| `ADMIN_PASSWORD` | Пароль админа | — |

---

## Чеклист перед первым запуском

- [ ] `npm install` выполнен
- [ ] `npm run build` выполнен без ошибок
- [ ] Правило брандмауэра для порта 8081 создано
- [ ] Файл `.env` настроен (или используются значения по умолчанию)
- [ ] Нет других процессов на порту 8081 (`netstat -ano | Select-String ":8081"`)
- [ ] Нет конфликтующих watchdog-скриптов
- [ ] Tailscale подключён на обоих устройствах (если используется)
