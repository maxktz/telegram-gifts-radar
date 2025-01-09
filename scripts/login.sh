source .env

docker run --rm -it -v "./sessions:/app/sessions" -v "./.env:/app/.env" telegram-gifts-radar bun run start
