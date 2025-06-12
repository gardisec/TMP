FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
COPY tg_bot.py .
COPY .env .

RUN pip install --no-cache-dir -r requirements.txt

CMD ["python", "tg_bot.py"]