# Run and deploy your app

[English](./README.md) | [简体中文](./README_zh-CN.md)

This contains everything you need to run your app locally.

## Features

- **Personalized Learning Paths**: AI custom-tailors a curriculum based on your goals, level, and time availability.
- **Intelligent Content Generation**: Real-time generation of high-quality learning materials in Markdown format.
- **AI Tutor Companion**: Built-in chat assistant to answer questions and provide guidance throughout your learning journey.
- **Automated Quizzes & Assessment**: Auto-generated quizzes after each module to reinforce knowledge and track performance.
- **Multi-Model Support**: Powered by Google Gemini and Alibaba Cloud Qwen, offering flexibility in AI providers.
- **Progress Tracking**: Automatically saves your learning progress and quiz scores.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
