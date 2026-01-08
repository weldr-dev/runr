# Overview

*A simple explanation of what Runr does and why it exists.*

> Want more technical detail? See [How It Works](how-it-works.md).

---

## The Problem

AI tools can write code. But they make mistakes. When they fail, you're often left wondering:

- What went wrong?
- How do I fix it?
- Did it break something else?

Most AI coding tools are like a worker who does things fast but doesn't check their work. When something goes wrong, they can't explain what happened.

---

## The Solution

Runr is a **supervisor** for AI coding tools.

It doesn't write code itself. Instead, it:

1. **Breaks big tasks into small steps** (milestones)
2. **Checks the work** after each step (runs your tests)
3. **Saves progress** so you can pick up where you left off
4. **Stays in bounds** (only touches files you allow)

Think of it like a construction foreman. The foreman doesn't swing the hammer, but they make sure the work gets done correctly, step by step.

---

## How It Works

```
Task → Plan → Do → Check → Save → Repeat
```

1. **You give it a task**: "Add a login page"
2. **It makes a plan**: Break this into 3-4 smaller steps
3. **It does one step**: Uses an AI tool to write the code
4. **It checks the work**: Runs your tests and linters
5. **It saves progress**: Makes a git commit
6. **It moves to the next step**: Or stops if something is wrong

If it fails, you get a clear explanation of what went wrong and how to continue.

---

## Why This Matters

### You can trust it

The agent can only change files you allow. It can't accidentally modify your database code when you asked it to fix a button.

### You can resume it

If something fails (or your computer crashes), you don't start over. You pick up exactly where it stopped.

### You can understand it

Every step is logged. You can see exactly what happened, what was tried, and why it stopped.

---

## What It's Not

- **Not a chatbot**: You don't have a conversation. You give it a task, it works, you get results.
- **Not magic**: It uses AI tools, and AI tools make mistakes. The goal is to make those mistakes recoverable.
- **Not a replacement for thinking**: You still need to write good task descriptions and review the output.

---

## Next Steps

- [Quickstart](quickstart.md) - Try it in 5 minutes
- [How It Works](how-it-works.md) - Technical details
