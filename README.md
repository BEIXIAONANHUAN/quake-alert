# 地震预警

山梨県甲府市善光寺3-1-5 · 个人地震监测与微信推送

## 功能

- 邮箱魔法链接登录（换设备数据同步）
- 緊急地震速報（警报含山梨県）立即微信推送
- 有感地震按「山梨県震度下限」推送（默认 2，可调）
- 每晚日本 0 点「警戒情報汇总 / 今夜平安」
- 冬眠模式一键全停
- 深色 PWA，可添加到手机主屏

## 目录

```text
index.html / css / js / icons / manifest.json / sw.js
supabase/schema.sql
supabase/functions/{quake-monitor,nightly-report,test-push}
.github/workflows/quake-alerts.yml
docs/部署指南.md
```

## 快速开始

请阅读 `docs/部署指南.md`。核心顺序：

1. Supabase 建项目 + 执行 `supabase/schema.sql`
2. 部署 3 个 Edge Function，并设置 Secrets
3. 填写 `js/config.js`
4. 推送到 GitHub 并开启 Pages
5. 配置 Actions Secrets（定时触发）
6. 手机安装 PWA

## 安全

- PushPlus token、service_role、CRON_SECRET **只放在** Supabase Secrets / GitHub Secrets
- 前端仅有 anon key（可公开）
- 数据库 RLS：用户只能读写自己的 settings / alerts
