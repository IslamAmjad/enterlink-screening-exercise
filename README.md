# Enterlink Developer Screening Exercise

## About Us

Enterlink builds an AI-powered platform that helps organizations make sense of their own data. Our users are busy professionals (not developers) who upload documents and structured data, then ask questions in plain language. The AI searches, retrieves, and synthesizes answers from everything the organization has uploaded.

Our north star: a non-technical user should be able to ask a question and get a trustworthy, sourced answer in seconds, not hours of manual searching.

## The Exercise

Below is a small FastAPI + Next.js application that represents a simplified version of our core workflow:

1. User uploads a CSV file containing structured records
2. Backend processes and stores the records in PostgreSQL
3. User asks a natural language question through the frontend
4. Backend searches the stored data and returns a sourced answer

The app works, but it has **three problems** that would frustrate real users. Your job is to find them, fix them, and explain your thinking.

**Time estimate:** 2-3 hours. Please do not spend more than 4 hours.

## Setup

```bash
# Backend
cd backend
pip install -r requirements.txt
# Set DATABASE_URL in .env (any PostgreSQL instance)
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## What We're Looking For

### Part 1: Bug Fixes (60%)

The three problems fall into these categories:

- **Problem A:** A data processing issue that silently corrupts records during CSV upload. Users won't notice until they get wrong answers to their questions.
- **Problem B:** A frontend state issue that makes the app feel broken after the user performs a specific sequence of actions.
- **Problem C:** A query performance issue that gets worse as more data is uploaded. It works fine with 100 records but becomes painful at 5,000+.

For each problem:
1. Identify the root cause
2. Fix it
3. Write 3-5 sentences explaining what was wrong and why your fix is correct

### Part 2: Design Judgment (40%)

Answer these two questions in writing (a few paragraphs each):

**Question 1:** A customer uploads 50 PDF documents (total: 2,000 pages) and then asks "What is our overtime policy?" The system has the answer buried in page 47 of one document, but it also has vaguely related content in 12 other documents. How would you design the retrieval and response so the user gets a clear, trustworthy answer? What tradeoffs are you making?

**Question 2:** We discover that 15% of our AI-generated answers contain minor factual errors (wrong numbers, misattributed sources). The errors are plausible enough that most users don't catch them. What would you build to address this? Think about both preventing errors and detecting them after the fact. Be specific about what you'd actually implement first vs. later.

## Submission

- Fork this repo (or zip it up)
- Make your fixes on a branch called `screening-fixes`
- Include a file called `ANSWERS.md` with your written explanations for Part 1 and Part 2
- Send the link or zip back to us within 5 days

## What This Exercise Is Not

- It's not a trick question or gotcha exercise
- We don't expect production-grade code in 3 hours
- We care more about your reasoning than your output volume
- Using AI tools is fine. We use them daily. But we will ask you about your decisions in a follow-up conversation, so make sure you understand everything you submit.
