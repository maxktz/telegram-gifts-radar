source .env

docker build -t telegram-gifts-radar .

docker run --rm telegram-gifts-radar bunx prisma migrate deploy

docker compose down && docker compose up -d