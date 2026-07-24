(async () => {
    const webhookUrl = process.env.DISCORD_WEBHOOK
    if (!webhookUrl) {
        console.error("Missing DISCORD_WEBHOOK")
        process.exit(1)
    }
    const content = "🧪 Discord test from GitHub Actions"
    const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({content})
    })
    if (!res.ok) {
        console.error(`Failed to post: ${res.status}`, await res.text())
        process.exit(1)
    }
    console.log("✅ Discord message sent")
})()