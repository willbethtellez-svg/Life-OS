"""
Life OS - Script de Tasa de Cambio Promediada

Este script calcula la tasa de cambio VES/USD promedio del día
basada en las transferencias P2P (Binance USDT -> Banesco VES)
registradas en Firefly III.

Uso:
    python exchange-rate.py --firefly-url http://localhost:8080 --token TU_TOKEN

Opcional:
    --date 2026-01-15  (para calcular un día específico)
    --save             (guarda la tasa en IndexedDB via API)
"""

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta

import requests


def fetch_transactions(firefly_url: str, token: str, start_date: str, end_date: str, page: int = 1) -> dict:
    """Obtiene transacciones de Firefly III."""
    url = f"{firefly_url}/api/v1/transactions"
    params = {
        "start": start_date,
        "end": end_date,
        "page": page,
        "limit": 200,
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    return response.json()


def calculate_average_rate(transactions: list) -> tuple[float | None, int]:
    """
    Calcula la tasa promedio ponderada de transferencias USDT/USD -> VES.
    Retorna (tasa_promedio, cantidad_de_transacciones).
    """
    total_usd = 0.0
    total_ves = 0.0
    count = 0

    for tx_wrapper in transactions:
        tx = tx_wrapper.get("attributes", tx_wrapper)
        tx_type = tx.get("type", "")

        if tx_type != "transfer":
            continue

        currency = tx.get("currency_code", "")
        foreign_currency = tx.get("foreign_currency_code", "")
        amount = abs(float(tx.get("amount", 0)))
        foreign_amount = abs(float(tx.get("foreign_amount", 0)))

        # Detecta transferencias USD/USDT -> VES
        if currency in ("USD", "USDT") and foreign_currency == "VES":
            total_usd += amount
            total_ves += foreign_amount
            count += 1
        elif currency == "VES" and foreign_currency in ("USD", "USDT"):
            total_usd += foreign_amount
            total_ves += amount
            count += 1

    if total_usd == 0:
        return None, 0

    rate = round(total_ves / total_usd, 2)
    return rate, count


def main():
    parser = argparse.ArgumentParser(description="Calcula tasa de cambio P2P promedio del día")
    parser.add_argument("--firefly-url", required=True, help="URL de la instancia de Firefly III")
    parser.add_argument("--token", required=True, help="Token de acceso personal de Firefly III")
    parser.add_argument("--date", help="Fecha en formato YYYY-MM-DD (por defecto: hoy)")
    parser.add_argument("--days", type=int, default=1, help="Días hacia atrás para buscar (por defecto: 1)")
    parser.add_argument("--save", action="store_true", help="Guardar tasa calculada (implementación pendiente)")
    parser.add_argument("--json", action="store_true", help="Salida en JSON")

    args = parser.parse_args()

    target_date = args.date or date.today().isoformat()
    start_date = (datetime.strptime(target_date, "%Y-%m-%d") - timedelta(days=args.days - 1)).strftime("%Y-%m-%d")

    if args.json:
        print(json.dumps({"status": "calculating", "date": target_date, "range": f"{start_date}..{target_date}"}))
    else:
        print(f"🔍 Buscando transferencias USD→VES del {start_date} al {target_date}...")

    try:
        all_transactions = []
        page = 1

        while True:
            data = fetch_transactions(args.firefly_url, args.token, start_date, target_date, page)
            entries = data.get("data", [])
            if not entries:
                break
            all_transactions.extend(entries)

            pagination = data.get("meta", {}).get("pagination", {})
            total_pages = pagination.get("total_pages", 1)
            if page >= total_pages:
                break
            page += 1

        rate, count = calculate_average_rate(all_transactions)

        result = {
            "date": target_date,
            "from": "USDT",
            "to": "VES",
            "rate": rate,
            "transactions_used": count,
            "source": "p2p_average",
        }

        if rate is None:
            if args.json:
                result["status"] = "no_data"
                print(json.dumps(result))
            else:
                print(f"\n❌ No se encontraron transferencias USD→VES en el período.")
                print(f"   Busca en más días con: --days 7")
            sys.exit(1)

        if args.json:
            result["status"] = "success"
            print(json.dumps(result))
        else:
            print(f"\n✅ Tasa calculada exitosamente:")
            print(f"   Fecha: {target_date}")
            print(f"   1 USDT = {rate:.2f} VES")
            print(f"   Basada en {count} transferencia(s)")
            print(f"   Fuente: P2P promedio")

            if args.save:
                print(f"\n⚠️  Auto-save no disponible. La tasa se guarda manualmente desde la app.")
                print(f"   Agrega esta tasa en Life OS > Tasas de Cambio > Agregar manual.")

    except requests.exceptions.ConnectionError:
        if args.json:
            print(json.dumps({"status": "error", "message": f"No se pudo conectar a {args.firefly_url}"}))
        else:
            print(f"\n❌ Error: No se pudo conectar a {args.firefly_url}")
            print(f"   Verifica que Firefly III esté corriendo y accesible.")
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        if args.json:
            print(json.dumps({"status": "error", "message": str(e)}))
        else:
            print(f"\n❌ Error HTTP: {e}")
            print(f"   Verifica el token de acceso.")
        sys.exit(1)
    except Exception as e:
        if args.json:
            print(json.dumps({"status": "error", "message": str(e)}))
        else:
            print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
