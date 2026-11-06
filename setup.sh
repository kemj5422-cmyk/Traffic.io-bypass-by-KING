#!/usr/bin/env bash
# Dùng: ./setup.sh <github-username> <ten-repo>
# Thay placeholder, khởi tạo git và đẩy lên GitHub.
set -euo pipefail
USER_GH="${1:?Thiếu GitHub username}"
REPO="${2:?Thiếu tên repo}"
grep -rlE "__GH_USER__|__GH_REPO__" --exclude=setup.sh --exclude-dir=.git . | while read -r f; do
  sed -i.bak "s/__GH_USER__/${USER_GH}/g; s/__GH_REPO__/${REPO}/g" "$f" && rm -f "$f.bak"
done
git init -q -b main
git add -A
git commit -qm "BYPASS KING v2.0.0"
git remote add origin "https://github.com/${USER_GH}/${REPO}.git"
git push -u origin main
echo "Xong. Vào Settings > Pages > Source: GitHub Actions để bật trang giao diện."
echo "Link cài: https://raw.githubusercontent.com/${USER_GH}/${REPO}/main/BYPASS_KING.user.js"
