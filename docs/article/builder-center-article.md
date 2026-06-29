# Aura: Making Bedrock AgentCore Agents Accessible to Everyone

**Tags:** Amazon Bedrock, AgentCore, Strands SDK, CloudFormation, Cognito, Amplify, DynamoDB, AI Agents, Serverless, Open Source  
**Level:** 300 (Advanced)  
**License:** MIT  
**Repository:** https://github.com/sufiankaki/aura  
**Services Used:** Amazon Cognito, Amazon DynamoDB, AWS Amplify Hosting, AWS Lambda, AWS IAM, Amazon Bedrock AgentCore

---

## The Last Mile Problem

I've been building AI agents on AWS Bedrock AgentCore for a while now. The Strands SDK makes it remarkably easy to go from an idea to a deployed agent — define your tools, pick a model, write a system prompt, and you have a working agent. AgentCore gives you a runtime: scalable, managed, always-on.

But then comes the question I kept running into: **how do I let people actually use this thing?**

AgentCore gives you an API endpoint. That's it. No UI, no authentication, no way for a non-technical person to discover what agents exist or start a conversation. Every time I built a new agent, I faced the same bottleneck: build a frontend, set up auth, figure out access control, wire up streaming — a whole project before anyone could test my agent.

I didn't want to build a new frontend every time. I wanted something I could deploy once and point at any agent. That's what Aura is.

## What Aura Does

Aura is an open-source framework — distributed as a single CloudFormation template, a prebuilt React frontend, and a README — that deploys a complete web application for accessing AgentCore agents.

Deploy the template. Get a working app. No frontend development required.

**For end users:**
- Passwordless sign-in (email one-time password — no passwords to manage)
- A dashboard showing agents available to them
- Streaming chat with any registered agent or harness
- Consent and terms acceptance before first use

**For administrators:**
- Register AgentCore agents or harnesses by ARN
- Control who can access each: all users, specific emails, or access groups
- Manage access groups (create groups, add/remove members)
- Everything through a web-based admin console

## Architecture

Aura deploys entirely within a single AWS region. Every resource is created fresh by the CloudFormation stack, prefixed with a project name you choose, and has no dependencies on pre-existing resources.

[DIAGRAM: architecture-overview]

```
User → Amplify Hosting (React SPA)
         ├── Cognito User Pool (Email OTP Auth)
         ├── Cognito Identity Pool (IAM Credentials)
         ├── DynamoDB (Agent Registry + Consent)
         └── AgentCore Runtime (Streaming Chat)
```

**The resource graph:**

| Service | Role |
|---------|------|
| **Cognito User Pool** | Passwordless email OTP authentication. Manages users, groups, and roles. |
| **Cognito Identity Pool** | Exchanges Cognito tokens for temporary IAM credentials. Maps admin/user groups to different IAM roles. |
| **DynamoDB** | Stores the agent registry (which agents exist, who can access them) and consent records. |
| **Amplify Hosting** | Serves the React frontend. Single-page app with SPA routing. |
| **IAM Roles** | User role: invoke agents + read registry. Admin role: adds Cognito management + registry writes. |
| **Lambda** | Custom resources that seed the initial admin and deploy the frontend from a GitHub release. |

The frontend talks directly to AWS services from the browser — no API Gateway, no backend Lambda at runtime. The Identity Pool issues scoped IAM credentials, and the browser uses them to call DynamoDB and AgentCore directly. This eliminates an entire layer of infrastructure.

## How It Works

[DIAGRAM: user-journey]

**The deploy experience (administrator):**

1. Run `aws cloudformation deploy` with three parameters: a project name, your email, and optionally a custom domain
2. Wait 5-10 minutes. The stack provisions everything.
3. Open the URL from the stack outputs. You're the admin.

**The user experience:**

1. Open the app URL
2. Enter your email → receive a one-time code → enter the code → you're in
3. Accept the terms of use (first time only)
4. See the dashboard of agents available to you
5. Click an agent → start chatting

**The admin experience:**

1. Everything a user gets, plus an Admin Console
2. Register agents by pasting an AgentCore runtime ARN
3. Choose who can access it: everyone, specific emails, or access groups
4. Create access groups and manage membership

## The Technical Decisions

**Why passwordless?** Because passwords are a support burden. For an internal tool that gives access to AI agents, the friction should be near zero. Email OTP means no password resets, no credential stores, no security questions. Cognito's native EMAIL_OTP (Essentials tier) handles it without custom Lambda triggers.

**Why direct SDK calls from the browser?** The traditional pattern is: browser → API Gateway → Lambda → downstream service. That's three hops for every chat message. AgentCore supports IAM authentication directly. With Cognito Identity Pool issuing temporary credentials, the browser can invoke `InvokeAgentRuntime` with no intermediary. Fewer moving parts, lower latency, lower cost.

[DIAGRAM: auth-flow]

**Why a single CloudFormation template?** I wanted the deployment to be atomic. Either everything works or nothing exists. CloudFormation gives you rollback semantics — if the DynamoDB table creation fails, the Cognito pool gets deleted too. No orphaned resources, no partial states to debug.

**Why Amplify over S3 + CloudFront?** Amplify Hosting gives you HTTPS, SPA routing rules, and manual zip deployment in one resource. The equivalent in raw S3 + CloudFront + ACM + OAI is four resources with a dependency chain that's easy to get wrong.

**Why the frontend loads config at runtime?** The same prebuilt bundle works for every deployment. The CloudFormation custom resource injects a `config.json` into the zip at deploy time with the Cognito IDs and table names. No rebuilding. No environment-specific bundles.

## Getting Started

**Prerequisites:**
- An AWS account with CloudFormation, Cognito, DynamoDB, Amplify, IAM, and Lambda permissions
- At least one AgentCore agent or harness deployed and ready

**Deploy:**

```bash
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name aura-myproject \
  --parameter-overrides \
    ProjectName=myproject \
    AdminEmail=you@example.com \
  --capabilities CAPABILITY_NAMED_IAM
```

That's it. Check the Outputs tab for your application URL.

**Configure your agent:**

Your AgentCore agent needs to allow the IAM role created by the stack (`{project-name}-user-role`) to call `bedrock-agentcore:InvokeAgentRuntime`. Aura passes:
- `runtimeSessionId` — unique per login session
- `runtimeUserId` — the user's Cognito sub (never their email)
- `payload` — `{"prompt": "user's message"}`

## What's Next

Aura v1 is deliberately minimal. The roadmap includes:

- **Federated SSO** — Google, Microsoft, SAML for enterprise deployments
- **Conversation history** — display past interactions in the UI
- **Usage analytics** — track which agents are being used and by whom
- **Multi-region** — deploy agents in different regions, access from one frontend
- **Theming** — customize branding without rebuilding
- **Agent chaining** — let users switch between agents in a single session

## Try It

Aura is open source under the MIT license.

- **GitHub:** https://github.com/sufiankaki/aura
- **Deploy it** in your account in 10 minutes
- **Star the repo** if it saves you time
- **Open an issue** if something doesn't work
- **Submit a PR** if you build something cool

I built this because I wanted my agents to be usable by people who don't have AWS console access. If you're building on AgentCore and facing the same "last mile" problem, I hope Aura helps you ship faster.

---

*Built by [Sufian Kaki](https://github.com/sufiankaki). Feedback welcome.*
