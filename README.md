<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0%3A2ea44f%2C100%3A1f6feb&height=220&section=header&text=Induwara%20Ashinsana&fontSize=48&fontColor=ffffff&animation=fadeIn&fontAlignY=36&desc=I%20build%20tools%20that%20ship%20themselves&descSize=18&descAlignY=55" alt="Induwara Ashinsana — I build tools that ship themselves" width="100%" />

<a href="https://induwara.lk"><img src="https://readme-typing-svg.demolab.com/?font=JetBrains+Mono&weight=600&size=21&duration=3200&pause=900&color=1F6FEB&center=true&vCenter=true&width=640&height=45&lines=550%2B+free+tools+for+Sri+Lanka;Shipped+by+an+autonomous+AI+pipeline;Free+%C2%B7+No+signup+%C2%B7+No+catch" alt="550+ free tools for Sri Lanka — shipped by an autonomous AI pipeline" /></a>

<br/>
<br/>

**I run [induwara.lk](https://induwara.lk) — 550+ free, no-signup tools, calculators and APIs for Sri Lanka.**

Most of them were built while I slept.

<br/>

<img src="https://img.shields.io/badge/free%20tools-550%2B-1f6feb?style=for-the-badge" alt="550+ free tools" />&nbsp;
<img src="https://img.shields.io/badge/articles-180%2B-1f6feb?style=for-the-badge" alt="180+ articles" />&nbsp;
<img src="https://img.shields.io/badge/signups%20required-0-2ea44f?style=for-the-badge" alt="0 signups required" />

<br/>

<a href="https://induwara.lk"><kbd>&nbsp;&nbsp;induwara.lk&nbsp;&nbsp;</kbd></a>&nbsp;&nbsp;
<a href="https://induwara.lk/tools"><kbd>&nbsp;&nbsp;Browse the tools&nbsp;&nbsp;</kbd></a>&nbsp;&nbsp;
<a href="https://induwara.lk/blog"><kbd>&nbsp;&nbsp;Read the blog&nbsp;&nbsp;</kbd></a>&nbsp;&nbsp;
<a href="https://induwara.lk/developers"><kbd>&nbsp;&nbsp;Free API&nbsp;&nbsp;</kbd></a>

</div>

<br/>

> [!NOTE]
> Quiet contribution graph, loud shipping schedule. The real work happens in an autonomous build pipeline on my server — it doesn't sign commits here, but everything it ships is public at [induwara.lk](https://induwara.lk).

<br/>

## What I ship

One site. 550+ tools. Instant, free, and none of them ask you to create an account.

| Category | What's inside |
|:--|:--|
| 💰 **Finance** | Income tax, EPF/ETF, loan EMI, VAT — official rates, sources cited |
| 🎓 **Education** | A/L Z-score and university admission tools |
| ⚡ **Bills** | Electricity and water tariff calculators |
| 🪪 **Utility** | NIC decoder and everyday lookups |
| 💻 **Developer** | In-browser Python, Java, C++, SQL and TypeScript compilers, plus a [free public API](https://induwara.lk/developers) |
| 🔒 **Privacy** | End-to-end encrypted, self-destructing secret chat |
| 🤖 **AI** | Website builder, diagram maker, presentation maker |

Alongside the tools: **180+ published articles** explaining the numbers behind them.

<br/>

## How they ship themselves

The interesting part isn't any single tool — it's the factory. I designed an autonomous, Claude-powered pipeline that proposes a tool worth building, writes the code, runs the full test gate, and deploys to production with zero downtime. Around the clock, zero-touch.

```mermaid
flowchart LR
    A["💡 Ideate<br/>Claude proposes a tool"] --> B["🔧 Build<br/>data · component · page"]
    B --> C{"🧪 Test gate<br/>typecheck · lint · build"}
    C -->|pass| D["🚀 Publish<br/>zero-downtime deploy"]
    C -->|"fail — flagged for review"| E["🚧 Benched"]
    D -.->|"loops — no humans in it"| A
```

My job is the part the pipeline can't do: pick the direction, verify the math against official sources, and make the factory itself better.

<br/>

## Stack

<div align="center">

<img src="https://skillicons.dev/icons?i=nextjs,ts,react,tailwind,nodejs,sqlite" alt="Next.js, TypeScript, React, Tailwind CSS, Node.js, SQLite" />

<br/>
<br/>

<a href="https://induwara.lk/tools"><img src="https://img.shields.io/badge/Claude%20AI-D97757?style=for-the-badge&logo=claude&logoColor=white" alt="Claude AI (Anthropic)" /></a>

<sub>Claude isn't an assistant in this stack — it's the workforce.</sub>

</div>

Next.js front to back. TypeScript everywhere. SQLite for everything stateful.

<br/>

## Open source

| Repo | What it is |
|:--|:--|
| 🗂️ [**induwara-lk-free-tools**](https://github.com/IAshinsana/induwara-lk-free-tools) | The living index of every tool on induwara.lk, synced from production. **Start here.** <br/><code>index</code> <code>showcase</code> <code>auto-updated</code> |
| 💬 [**secret-chat**](https://github.com/IAshinsana/secret-chat) | E2EE self-destructing chat — the server only ever stores ciphertext. <br/><code>E2EE</code> <code>zero-knowledge</code> <code>self-destructing</code> |
| 🔥 [**one-time-secret**](https://github.com/IAshinsana/one-time-secret) | Secrets that burn after one read. A Privnote alternative. <br/><code>encryption</code> <code>burn-after-reading</code> |
| 📦 [**secret-file**](https://github.com/IAshinsana/secret-file) | Encrypted file sharing with the same burn-after-reading model. <br/><code>encryption</code> <code>file-sharing</code> |
| 🗺️ [**sri-lanka-trip-planner**](https://github.com/IAshinsana/sri-lanka-trip-planner) | Open travel data: 25 districts × 150 places. <br/><code>open-data</code> <code>travel</code> |
| 🧾 [**sri-lanka-tax-calculator**](https://github.com/IAshinsana/sri-lanka-tax-calculator) | Sri Lanka income tax with current IRD brackets — every rate cited. <br/><code>IRD-cited</code> <code>TypeScript</code> |

<br/>

<div align="center">

Built in Sri Lanka 🇱🇰 &nbsp;·&nbsp; Free for everyone

[Website](https://induwara.lk) · [Blog](https://induwara.lk/blog) · [API](https://induwara.lk/developers) · [Tool index](https://github.com/IAshinsana/induwara-lk-free-tools)

<img src="https://capsule-render.vercel.app/api?type=waving&color=0%3A2ea44f%2C100%3A1f6feb&height=110&section=footer" alt="" width="100%" />

</div>