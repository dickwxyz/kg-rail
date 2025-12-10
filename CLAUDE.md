# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based educational platform for an urban rail transit operations management course (城市轨道交通运营管理课程). The platform features a knowledge graph, AI-powered Q&A, knowledge testing, course resources, and student/teacher management systems.

## Technology Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite3 (user.db)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **External APIs**: OpenRouter API for AI features (via Gemini/DeepSeek models)

## Commands

### Development
```bash
# Start the server (runs on port 5500)
npm start

# Or directly
node server.js
```

### Testing Database Connection
```bash
# Test database connectivity
node test-connection-db.js
```

## Architecture

### Database Schema

The SQLite database (`user.db`) contains three main tables:

- **student**: Stores student information with fields: id (学号, 9-10 digits), name, grade, phone, email, password, teacher, lesson
- **teacher**: Stores teacher information with fields: id (工号, 4 digits), name, phone, email, password
- **degree**: Appears to store coordinate data (x, y) for knowledge graph visualization

### User Authentication Flow

1. **Registration** (`POST /register`):
   - Determines user type by ID length: 4 digits = teacher, 9-10 digits = student
   - Validates required fields and ID format
   - Inserts into appropriate table (teacher/student)

2. **Login** (`POST /login`):
   - Uses ID length to determine which table to query
   - Plain text password comparison (no hashing - security concern)
   - Returns user info with userType field
   - Client stores userInfo in localStorage

3. **Session Management**:
   - No server-side sessions
   - Client-side localStorage stores user info as JSON
   - All pages check localStorage on load to show/hide login UI

### Frontend Pages

- **index.html**: Course homepage with course info and teacher bio
- **login.html**: User login page
- **register.html**: User registration page
- **aiqa.html**: AI-powered Q&A interface with conversation history and markdown/LaTeX rendering
- **resources.html**: Course materials including textbook (PDF), chapter documents (Markdown/HTML), PPT slides, MOOC videos, past assignments, papers, and supplementary materials
- **knowledge-graph.html**: Knowledge graph visualization
- **test.html**: Knowledge testing interface

### AI Q&A System (aiqa.html)

- Uses OpenRouter API to access multiple LLM models (Gemini 2.0 Flash, DeepSeek R1, DeepSeek V3.2)
- Maintains conversation history for context-aware responses
- Renders responses with markdown-it and KaTeX for mathematical formulas
- System prompt: "你是轨道交通领域的专家，能够回答相关专业性问题，语言能够体现专业性和逻辑性。"
- API key is hardcoded in the frontend (security concern)

### Resource Organization

The `resources/` directory contains:
- **markdown-book/**: 16 chapters as both .md and .html files covering all course topics
- **ppt/**: PowerPoint slides (as PDFs) for chapters 2-11
- **video/**: MOOC videos organized by chapter (chapters 1-16, excluding chapter 9)
- **paper/**: Academic papers in PDF format
- **extra/**: Supplementary materials including Shanghai metro maps (PNG and shp files)
- **城市轨道交通运营管理.pdf**: Main textbook (163.2MB)

### Course Content Structure

The course covers 16 chapters:
1. Introduction (绪论)
2. Technical and economic characteristics of urban rail transit systems
3. Basic concepts of train operation and passenger travel
4. Passenger flow characteristics analysis and service design principles
5. Operational planning and scheduling techniques
6. Transportation capacity theory and calculation
7. Capacity enhancement and speed improvement techniques
8. Operations dispatch and command technology
9. Train operation control technology
10. Station management and passenger flow organization
11. Network operations organization technology
12. Fare management
13. Equipment maintenance management
14. Safety management
15. Enterprise organizational structure and management models
16. Policies and business models

## Security Considerations

- Passwords are stored in plain text in the database
- CORS is enabled with `origin: "*"` allowing any domain
- OpenRouter API key is exposed in client-side JavaScript
- No input sanitization for SQL injection prevention
- No HTTPS enforcement
- No rate limiting on API endpoints

When making security improvements, prioritize authentication, password hashing (bcrypt), API key protection (environment variables), input validation, and SQL parameterization (already partially implemented with db.get/db.run).

## Development Notes

- Server runs on port 5500
- All HTML files share similar navigation structure and styling
- User session is managed entirely client-side via localStorage
- No build process or bundler - direct file serving
- Chinese language content throughout the application
