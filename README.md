# solo-6600021: 盲文翻译与触觉学习器

## 技术栈
- Vue 3 + TypeScript + Vite + Pinia + Tailwind CSS + SVG + Vibration API

## 核心特性
1. **中英文→盲文实时翻译**：Braille Grade 1 编码，Unicode 盲文字符输出
2. **6 点阵 SVG 大尺寸渲染**：可交互点击选择盲文点阵
3. **Vibration API 触觉模拟**：答对/答错不同振动模式
4. **训练模式**：看字符选盲文，正确率统计，历史记录
5. **速查表**：26 字母 + 数字完整盲文对照
6. **可打印 PDF 导出**：翻译结果导出为文本文件
7. **学习档案导出与归档**：
   - 勾选收录答题记录与编码结果，导出前预览条目数、时间范围与涉及月份
   - 按月份归拢为本地档案（localStorage 持久化），支持单月/全部下载为离线 JSON
   - 逐条落盘：进行中按钮锁定防重复点击；中途失败列出未写入条目并可重试，已写部分不丢
   - 保留期（月）到期清理：清理前逐条列出将删除的内容并要求确认，取消则档案保持可读
   - 月份文案由 `utils/time.ts` 统一提供，答题、编码、档案三处显示一致

## 启动
```bash
cd frontend && npm install && npm run dev
```

## 自测
```bash
cd frontend && npm run test:archive
```
