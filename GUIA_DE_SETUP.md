# Life OS — Guía de Setup

## 1. Crear cuentas gratuitas

### GitHub
1. Ve a https://github.com/signup
2. Crea una cuenta con tu email
3. Confirma tu email

### Railway.app (para Firefly III)
1. Ve a https://railway.app
2. Regístrate con GitHub
3. Ve a Dashboard → New Project → Deploy from repo (usaremos la CLI)

### Vercel (para la PWA)
1. Ve a https://vercel.com
2. Regístrate con GitHub → "Continue with GitHub"
3. Concede los permisos

---

## 2. Desplegar Firefly III en Railway

### Opción A: Con un clic (recomendada)

1. Ve a: https://railway.com/template/firefly-iii
2. Haz clic en **Deploy Now**
3. Railway creará automáticamente:
   - Firefly III + PostgreSQL
4. Espera ~3 minutos a que termine el deploy
5. Railway te dará una URL tipo `https://firefly-iii-xxxx.up.railway.app`
6. Abre esa URL en tu navegador
7. Registra tu cuenta (primer usuario = admin)

### Opción B: Usando el docker-compose.yml

1. Instala Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```
2. Clona el proyecto o sube la carpeta a GitHub
3. Desde la terminal:
   ```bash
   railway login
   railway init
   railway up
   ```
4. Railway detectará el `docker-compose.yml` y desplegará todo

### Generar Token de API

1. Una vez dentro de Firefly III, ve a:
   **Opciones (engranaje) → Perfil → Tokens de acceso personal**
2. Haz clic en "Crear nuevo token"
3. Dale un nombre como "Life OS PWA"
4. Copia el token (empieza con `eyJ...`)

---

## 3. Configurar Firefly III

### Monedas
1. Ve a **Opciones → Preferencias → Monedas**
2. Habilita: USD, VES, EUR, BTC, USDT
3. Marca USD como moneda principal

### Cuentas bancarias
1. Ve a **Cuentas → Crear nueva cuenta**
2. Tipo: **Activo** (Asset account)
3. Crea cada una de tus cuentas reales:
   - Binance (USDT)
   - Banesco (VES)
   - Banco Venezuela (VES)
   - Cuenta USD personal
   - Cuenta EUR
   - BTC wallet (opcional: no incluir en patrimonio)
4. Al crear, pon el **saldo inicial** correcto

### Cuenta compartida familiar (split 3 vías)
Para la cuenta que se divide en 3 partes:
1. Crea la cuenta principal como "Cuenta Familiar USD"
2. Para el control de las 3 partes, crea 3 cuentas "hijo" adicionales:
   - "Familia - Parte 1"
   - "Familia - Parte 2"  
   - "Familia - Parte 3"
3. Usa **transferencias** de la cuenta principal a las hijas para reflejar la distribución

### Jarras / Fondos (Piggy Banks)
1. Ve a **Alcancías** (Piggy Banks)
2. Crear nueva alcancía para cada jarra:
   - "Gastos Generales"
   - "Ahorro Emergencias"
   - "Vacaciones"
   - "Educación Bebé"
   - etc.
3. Ponle monto objetivo a cada una
4. El saldo se actualiza cuando marcas transacciones como "guardadas en alcancía"

### Categorías
1. Ve a **Categorías**
2. Crea: Comida, Transporte, Servicios, Vivienda, Salud, Educación, Entretenimiento, etc.

### Presupuestos
1. Ve a **Presupuestos**
2. Crea presupuestos mensuales por categoría
3. Ponle límite de gasto a cada uno

### Préstamos/Deudas (Liabilities)
1. Ve a **Pasivos** (Liabilities)
2. Agrega préstamos que hayas dado o recibido

---

## 4. Desplegar la PWA en Vercel

### Subir el código a GitHub
1. Crea un repositorio en GitHub llamado `lifeos`
2. Sube todo el contenido de la carpeta `pwa/`:
   ```bash
   cd pwa
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/TU_USUARIO/lifeos.git
   git push -u origin main
   ```

### Conectar con Vercel
1. Ve a https://vercel.com
2. Dashboard → Add New → Project
3. Importa el repositorio `lifeos`
4. En **Environment Variables** agrega:
   - `NEXT_PUBLIC_FIREFLY_URL`: La URL de tu Firefly III (ej: `https://firefly-iii-xxxx.up.railway.app`)
   - `NEXT_PUBLIC_FIREFLY_TOKEN`: Tu token de acceso personal
5. Haz clic en **Deploy**
6. ¡Listo! Vercel te dará una URL como `https://lifeos.vercel.app`
7. Abre desde tu PC y desde tu teléfono

---

## 5. Usar la app en el teléfono

### Instalar como PWA
1. Abre la URL de Vercel en **Chrome** (Android) o **Safari** (iPhone)
2. **Android**: Te aparecerá un banner "Agregar a pantalla de inicio"
3. **iPhone**: Toca el botón Compartir → "Agregar a pantalla de inicio"
4. La app se verá y funcionará como una app nativa

### Sin conexión (offline)
- La app funciona sin internet para los módulos: Hogar, Vehículo, Bebé
- Las transacciones se guardan localmente y se sincronizan cuando vuelvas a tener conexión
- Si registras una transacción sin conexión, queda como "pendiente" hasta que confirmes

---

## 6. Tasa de cambio automática

### Script de tasa P2P
El script `scripts/exchange-rate.py` calcula la tasa VES/USD en base a transferencias P2P.

### Automatizar con GitHub Actions
1. En la raíz del proyecto, crea `.github/workflows/exchange-rate.yml`:

```yaml
name: Calcular tasa de cambio
on:
  schedule:
    - cron: '0 22 * * *'  # 6 PM Venezuela
  workflow_dispatch:

jobs:
  calc:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install requests
      - run: |
          python scripts/exchange-rate.py \
            --firefly-url "${{ secrets.FIREFLY_URL }}" \
            --token "${{ secrets.FIREFLY_TOKEN }}" \
            --json
```

2. Ve a GitHub → Settings → Secrets → Add secrets:
   - `FIREFLY_URL`: URL de tu Firefly III
   - `FIREFLY_TOKEN`: Token de API

---

## 7. Flujo diario recomendado

### ☀️ Mañana (30 segundos desde el teléfono)
1. Abre Life OS → Transacciones
2. Si tienes gastos del día anterior sin registrar:
   - Monto, Descripción, Cuenta ← solo 3 campos
   - Toca "Registrar" (queda como pendiente)

### 🌙 Noche (2 minutos)
1. Abre la app → Revisa las pendientes
2. Si el banco ya refleja el movimiento, toca "Confirmar"
3. Revisa el Dashboard para ver tu net worth
4. Verifica que no haya diferencias grandes en Cuentas

### 📅 Semanal (5 minutos)
1. Revisa el módulo Hogar para tareas pendientes
2. Revisa el módulo Vehículo (próximos mantenimientos)
3. Haz conciliación rápida de cuentas:
   - Ve a Cuentas → Elige una cuenta
   - Ingresa el saldo real que ves en el banco
   - Si hay diferencia, busca transacciones faltantes

---

## 8. Solución de problemas

| Problema | Causa | Solución |
|---|---|---|
| No conecta con Firefly III | Token inválido | Regenera el token en Firefly III > Perfil |
| Las transacciones no aparecen | Firefly III caído | Verifica Railway.app > Dashboard > Logs |
| La PWA no se instala en iPhone | No abriste con Safari | Solo Safari en iOS permite instalar PWAs |
| Las tasas no se calculan | No hay transferencias P2P | Haz una transferencia o agrega tasa manual |
| Saldo de cuenta incorrecto | Transacción sin registrar | Revisa el extracto bancario y agrega faltantes |
