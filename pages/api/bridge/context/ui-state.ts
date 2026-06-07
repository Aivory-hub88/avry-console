import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const vpsBridgeUrl = process.env.VPS_BRIDGE_URL

    if (!vpsBridgeUrl) {
      console.error('[ui-state] Missing VPS_BRIDGE_URL')
      return res.status(500).json({ error: 'Bridge configuration missing' })
    }

    // Proxy the request to VPS Bridge
    const bridgeResponse = await fetch(`${vpsBridgeUrl}/context/ui-state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    })

    if (!bridgeResponse.ok) {
      console.error('[ui-state] Bridge error:', bridgeResponse.status)
      return res.status(502).json({ error: 'Bridge unreachable' })
    }

    const data = await bridgeResponse.json()
    return res.status(200).json(data)
  } catch (error: any) {
    console.error('[ui-state] error:', error)
    return res.status(500).json({ error: 'Internal error' })
  }
}
