import { supabase } from "../../../shared/lib/supabase";

export const OWNER_REWARD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const OWNER_REWARD_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type OwnerRewardImageFolder = "rewards" | "starter-rewards" | "offers";

export function validateOwnerRewardImage(file: Pick<File, "size" | "type">): string | null {
  if (!OWNER_REWARD_IMAGE_TYPES.includes(file.type as (typeof OWNER_REWARD_IMAGE_TYPES)[number])) {
    return "Bitte wähle eine JPG-, PNG- oder WebP-Datei.";
  }
  if (file.size > OWNER_REWARD_IMAGE_MAX_BYTES) {
    return "Das Bild darf maximal 5 MB groß sein.";
  }
  return null;
}

function imageExtension(file: Pick<File, "type">) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export async function uploadOwnerRewardImage(input: {
  restaurantId: string;
  folder: OwnerRewardImageFolder;
  entityId?: string | null;
  file: File;
}) {
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert.");

  const validationError = validateOwnerRewardImage(input.file);
  if (validationError) throw new Error(validationError);

  const entityScope = input.entityId?.replace(/[^a-zA-Z0-9-]/g, "") || "draft";
  const objectPath = `${input.restaurantId}/${input.folder}/${entityScope}/${crypto.randomUUID()}.${imageExtension(input.file)}`;
  const { error } = await supabase.storage.from("restaurant-media").upload(objectPath, input.file, {
    cacheControl: "3600",
    contentType: input.file.type,
    upsert: false,
  });
  if (error) throw error;

  return {
    objectPath,
    publicUrl: supabase.storage.from("restaurant-media").getPublicUrl(objectPath).data.publicUrl,
  };
}

export async function removeOwnerRewardImageUpload(objectPath: string) {
  if (!supabase) return;
  await supabase.storage.from("restaurant-media").remove([objectPath]);
}
