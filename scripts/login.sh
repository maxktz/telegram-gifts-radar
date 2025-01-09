source .env

docker run --rm -it -v "./sessions:/app/sessions" telegram-gifts-radar bun run start
