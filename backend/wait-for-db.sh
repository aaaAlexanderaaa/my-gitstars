#!/bin/sh
# wait-for-db.sh

set -e

host="$1"
shift

until nc -z $host 5432; do
  >&2 echo "Postgres is unavailable - sleeping"
  sleep 1
done

>&2 echo "Postgres is up - executing command"