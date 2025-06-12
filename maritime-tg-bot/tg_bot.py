import os
import requests
import schedule
import time
import logging
from threading import Thread
from dotenv import load_dotenv
import psycopg2
from datetime import datetime, timedelta

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
DATABASE_URL = os.getenv('DATABASE_URL')

if not TELEGRAM_BOT_TOKEN or not DATABASE_URL:
    logging.critical("Критическая ошибка: не найдены переменные окружения TELEGRAM_BOT_TOKEN или DATABASE_URL. Бот не может быть запущен.")
    exit()

def get_db_connection():
    """Устанавливает и возвращает соединение с базой данных."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except psycopg2.OperationalError as e:
        logging.error(f"Ошибка подключения к базе данных: {e}")
        return None

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Отправляет пользователю его Telegram ID."""
    user = update.effective_user
    chat_id = update.effective_chat.id
    
    logging.info(f"Пользователь {user.username} (ID: {user.id}) нажал /start. Chat ID: {chat_id}")

    reply_text = (
        f"Здравствуйте, {user.first_name}!\n\n"
        f"Чтобы получать уведомления, используйте этот ID в вашем профиле на сайте:\n\n"
        f"<code>{chat_id}</code>\n\n"
        "Просто скопируйте его и вставьте в поле 'Telegram ID', а затем оформите подписку на необходимые компоненты."
    )
    
    await update.message.reply_html(reply_text)

def send_telegram_message(chat_id, text):
    """Отправляет отформатированное сообщение в Telegram."""
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'}
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code != 200:
            logging.error(f"Ошибка отправки сообщения пользователю {chat_id}: {response.text}")
    except requests.exceptions.RequestException as e:
        logging.error(f"Сетевая ошибка при отправке сообщения: {e}")

def get_expiring_components_from_db():
    """Получает компоненты с истекающим сроком напрямую из БД, включая IMO судна."""
    conn = get_db_connection()
    if not conn:
        return None
        
    query = """
    SELECT 
        c.name,
        c.serial_number,
        c.component_type_id,
        s.imo_number, -- Добавляем IMO номер
        s.name AS ship_name, -- И имя корабля
        (c.last_inspection_date + (c.service_life_months * INTERVAL '1 month')) AS expiration_date,
        EXTRACT(DAY FROM (c.last_inspection_date + (c.service_life_months * INTERVAL '1 month')) - CURRENT_DATE)::integer AS days_remaining
    FROM components c
    JOIN ships s ON c.ship_id = s.id -- Присоединяем таблицу с кораблями
    WHERE 
        c.status = 'Рабочий' 
        AND
        (c.last_inspection_date + (c.service_life_months * INTERVAL '1 month'))
        BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 day';
    """
    try:
        with conn.cursor() as cur:
            cur.execute(query)
            rows = cur.fetchall()
            components = [
                {
                    "name": row[0],
                    "serial_number": row[1],
                    "component_type_id": row[2],
                    "imo_number": row[3],
                    "ship_name": row[4],
                    "expiration_date": row[5].strftime('%Y-%m-%d'),
                    "days_remaining": row[6]
                }
                for row in rows
            ]
            return components
    except Exception as e:
        logging.error(f"Ошибка выполнения SQL-запроса на получение компонентов: {e}")
        return None
    finally:
        if conn:
            conn.close()

def get_all_subscriptions_from_db():
    """Получает все подписки пользователей напрямую из БД."""
    conn = get_db_connection()
    if not conn:
        return None

    query = """
    SELECT u.telegram_id, cs.component_type_id
    FROM component_subscriptions cs
    JOIN users u ON cs.user_id = u.id
    WHERE u.telegram_id IS NOT NULL;
    """
    try:
        with conn.cursor() as cur:
            cur.execute(query)
            rows = cur.fetchall()
            
            subscriptions_by_user = {}
            for telegram_id, component_type_id in rows:
                if telegram_id not in subscriptions_by_user:
                    subscriptions_by_user[telegram_id] = []
                subscriptions_by_user[telegram_id].append(component_type_id)
            
            return [
                {"telegram_id": tid, "subscribed_type_ids": types}
                for tid, types in subscriptions_by_user.items()
            ]

    except Exception as e:
        logging.error(f"Ошибка выполнения SQL-запроса на получение подписок: {e}")
        return None
    finally:
        if conn:
            conn.close()

def format_notification_message(components):
    """Форматирует сообщение для отправки."""
    if not components: return None
    text_parts = ["<b>Уведомление о компонентах с истекающим сроком:</b>\n"]
    for comp in components:
        part = (
            f"\n- <b>{comp['name']}</b> (SN: {comp.get('serial_number', 'N/A')})\n"
            f"  Судно: {comp.get('ship_name', 'N/A')} (IMO: {comp.get('imo_number', 'N/A')})\n"
            f"  <i>Срок истекает: {comp['expiration_date']} (осталось {comp['days_remaining']} дн.)</i>"
        )
        text_parts.append(part)
    return "\n".join(text_parts)

def check_and_send_notifications():
    """Главная функция проверки и отправки уведомлений."""
    logging.info("Запуск проверки уведомлений...")
    
    expiring_components = get_expiring_components_from_db()
    
    if not expiring_components:
        logging.info("Нет компонентов с истекающим сроком или произошла ошибка БД.")
        return
    logging.info(f"Найдено компонентов с истекающим сроком: {len(expiring_components)}")

    expiring_by_type = {}
    for comp in expiring_components:
        type_id = comp['component_type_id']
        if type_id not in expiring_by_type:
            expiring_by_type[type_id] = []
        expiring_by_type[type_id].append(comp)

    subscriptions = get_all_subscriptions_from_db()
    if not subscriptions:
        logging.info("Нет активных подписок или произошла ошибка БД.")
        return
    logging.info(f"Найдено пользователей с подписками: {len(subscriptions)}")

    total_sent = 0
    for user_sub in subscriptions:
        telegram_id = user_sub['telegram_id']
        components_to_notify = []
        
        for type_id in user_sub['subscribed_type_ids']:
            if type_id in expiring_by_type:
                components_to_notify.extend(expiring_by_type[type_id])

        if components_to_notify:
            unique_components = {c['name'] + c['serial_number']: c for c in components_to_notify}.values()
            
            message = format_notification_message(list(unique_components))
            if message:
                logging.info(f"Отправка {len(unique_components)} уведомлений пользователю {telegram_id}...")
                send_telegram_message(telegram_id, message)
                total_sent += 1
                
    logging.info(f"Проверка завершена. Отправлено уведомлений: {total_sent}.")

def run_scheduler():
    """Функция планировщика."""
    logging.info("Планировщик уведомлений запущен.")
    schedule.every().day.at("09:00").do(check_and_send_notifications)
    while True:
        schedule.run_pending()
        time.sleep(1)

def main():
    """Основная функция запуска."""
    logging.info("Запуск бота...")
    
    scheduler_thread = Thread(target=run_scheduler, daemon=True)
    scheduler_thread.start()
    
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start_command))

    logging.info("Бот запущен и готов принимать команды.")
    application.run_polling()

if __name__ == '__main__':
    check_and_send_notifications()
    main()