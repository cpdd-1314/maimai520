#!/bin/bash
# ============================================================
#  微信小商店 —— 一键推送到 GitHub（零输入版）
#  默认推送目标:  https://github.com/cpdd-1314/maimai520.git
#  用法:          bash push-to-github.sh
#                （也可带参数覆盖目标仓库：bash push-to-github.sh 仓库地址）
# ============================================================
set -e

DEFAULT_REPO="https://github.com/cpdd-1314/maimai520.git"
REPO_URL="${1:-$DEFAULT_REPO}"

echo "📁 当前目录: $(pwd)"
echo "🎯 目标仓库: $REPO_URL"

# 1. 若目录还不是 git 仓库则初始化（分支统一为 main）
if [ ! -d .git ]; then
  echo "→ 初始化 git 仓库..."
  git init -q
  git checkout -q -b main 2>/dev/null || git branch -q -M main
fi

# 2. 提交全部代码
git add -A
if git diff --cached --quiet; then
  echo "（没有新改动需要提交，直接推送已有提交）"
else
  git -c user.name="wxshop" -c user.email="wxshop@local" commit -q -m "微信小商店：上传商品售卖 + 微信扫码支付（个人收款码/官方API）+ 订单管理后台"
  echo "✓ 已提交"
fi

# 3. 配置远端
if git remote | grep -q '^origin$'; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

# 4. 推送
echo "🚀 正在推送 ...（首次会要求登录 GitHub，见教程）"
git push -u origin main

echo ""
echo "============================================================"
echo "✅ 推送完成！代码已发布到你的 GitHub 私有仓库："
echo "   $REPO_URL"
echo ""
echo "下一步（真正把网站跑起来，二选一）："
echo "  A. Render：把该仓库连到 Render（仓库根目录已有 render.yaml，选 Starter 数据持久），参考 README.md 第四节"
echo "  B. VPS：用仓库里的 .github/workflows/deploy.yml 自动部署"
echo "============================================================"
