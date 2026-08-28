// HeyGen AI avatar video generation.
// Two-step flow: start a render (returns immediately), then poll
// separately for completion, since rendering takes minutes and
// serverless functions can't hold a request open that long.

const HEYGEN_BASE = "https://api.heygen.com";

async function getDefaultAvatarId(): Promise<string> {
  if (process.env.HEYGEN_AVATAR_ID) return process.env.HEYGEN_AVATAR_ID;

  const res = await fetch(`${HEYGEN_BASE}/v2/avatars`, {
    headers: { "x-api-key": process.env.HEYGEN_API_KEY! },
  });
  const data = await res.json();
  const firstAvatar = data.data?.avatars?.[0]?.avatar_id;
  if (!firstAvatar) throw new Error("No HeyGen avatars available on this account");
  return firstAvatar;
}

async function getDefaultVoiceId(): Promise<string> {
  if (process.env.HEYGEN_VOICE_ID) return process.env.HEYGEN_VOICE_ID;

  const res = await fetch(`${HEYGEN_BASE}/v2/voices`, {
    headers: { "x-api-key": process.env.HEYGEN_API_KEY! },
  });
  const data = await res.json();
  const firstVoice = data.data?.voices?.[0]?.voice_id;
  if (!firstVoice) throw new Error("No HeyGen voices available on this account");
  return firstVoice;
}

export async function startVideoGeneration(
  script: string,
  format: "short" | "long"
): Promise<string> {
  const avatarId = await getDefaultAvatarId();
  const voiceId = await getDefaultVoiceId();

  const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.HEYGEN_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: avatarId,
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: script,
            voice_id: voiceId,
          },
        },
      ],
      dimension:
        format === "short"
          ? { width: 720, height: 1280 }
          : { width: 1280, height: 720 },
    }),
  });

  if (!res.ok) {
    throw new Error(`HeyGen generate failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const videoId = data.data?.video_id;
  if (!videoId) throw new Error("HeyGen did not return a video_id");
  return videoId;
}

export async function checkVideoStatus(videoId: string) {
  const res = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${videoId}`, {
    headers: { "x-api-key": process.env.HEYGEN_API_KEY! },
  });

  if (!res.ok) {
    throw new Error(`HeyGen status check failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    status: data.data?.status, // "processing" | "completed" | "failed"
    videoUrl: data.data?.video_url,
    error: data.data?.error,
  };
}
