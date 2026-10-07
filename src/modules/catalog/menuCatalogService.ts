import { supabase } from "../../shared/lib/supabase";

export type MenuPage = {
  id: string;
  filename: string;
  mime_type: "image/jpeg" | "application/pdf";
  byte_size: number;
  sha256: string;
  page_count: number | null;
};

export type OwnerMenuCatalog = {
  restaurant_id: string;
  branch_id: string;
  entitled: boolean;
  page_limit: number;
  draft_page_count: number | null;
  published_page_count: number | null;
  media_within_limit: boolean;
  draft_pages: MenuPage[];
  draft_text: string;
  draft_revision: number;
  published: boolean;
  published_at: string | null;
  text_published: boolean;
  text_published_at: string | null;
  text_version: number;
  text_hash: string | null;
  published_pages: MenuPage[];
  published_version: number;
  published_hash: string | null;
};

export type CustomerMenuCatalog =
  | { available: false }
  | { available: true; restaurant_id: string; branch_id: string; catalog_id: string;
      version: number | null; hash: string | null; published_at: string | null; pages: MenuPage[];
      text: string | null; text_version: number | null; text_hash: string | null; text_published_at: string | null };

function client() {
  if (!supabase) throw new Error("Live-Daten sind gerade nicht verfügbar.");
  return supabase;
}

export async function loadOwnerMenuCatalog(restaurantId: string): Promise<OwnerMenuCatalog> {
  const { data, error } = await client().rpc("get_owner_menu_catalog", { input_restaurant_id: restaurantId });
  if (error) throw error;
  return data as OwnerMenuCatalog;
}

export async function manageOwnerMenuCatalog(
  restaurantId: string,
  branchId: string,
  action: "SAVE_ORDER" | "PUBLISH" | "UNPUBLISH" | "SAVE_TEXT" | "PUBLISH_TEXT" | "UNPUBLISH_TEXT",
  pageIds: string[] | null,
  expectedDraftRevision: number,
  expectedPublishedVersion: number,
  text: string | null = null,
  expectedTextVersion: number | null = null,
): Promise<OwnerMenuCatalog> {
  const { data, error } = await client().rpc("manage_owner_menu_catalog", {
    input_restaurant_id: restaurantId,
    input_branch_id: branchId,
    input_action: action,
    input_page_ids: pageIds,
    input_expected_draft_revision: expectedDraftRevision,
    input_expected_published_version: expectedPublishedVersion,
    input_text: text,
    input_expected_text_version: expectedTextVersion,
  });
  if (error) throw error;
  return data as OwnerMenuCatalog;
}

export async function loadCustomerMenuCatalog(slug: string, token: string): Promise<CustomerMenuCatalog> {
  const { data, error } = await client().rpc("get_customer_menu_catalog", {
    input_restaurant_slug: slug,
    input_customer_token: token,
  });
  if (error) throw error;
  return data as CustomerMenuCatalog;
}

export async function removeOwnerMenuDraftPage(
  restaurantId: string, branchId: string, pageId: string, expectedDraftRevision: number,
): Promise<OwnerMenuCatalog> {
  const { data, error } = await client().rpc("remove_owner_menu_draft_page", {
    input_restaurant_id: restaurantId,
    input_branch_id: branchId,
    input_page_id: pageId,
    input_expected_draft_revision: expectedDraftRevision,
  });
  if (error) throw error;
  return data as OwnerMenuCatalog;
}

export async function uploadMenuPage(restaurantId: string, branchId: string, file: File): Promise<void> {
  if (file.size > 10 * 1024 * 1024 || file.size === 0 || !["image/jpeg", "application/pdf"].includes(file.type)) {
    throw new Error("MENU_FILE_INVALID");
  }
  const session = await client().auth.getSession();
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/catalog-media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.data.session?.access_token ?? ""}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "x-menu-action": "upload",
      "x-restaurant-id": restaurantId,
      "x-branch-id": branchId,
      "x-file-name": encodeURIComponent(file.name),
    },
    body: file,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`MENU_UPLOAD_${response.status}`);
}

export async function fetchMenuMedia(params:
  | { kind: "owner"; restaurantId: string; pageId: string }
  | { kind: "customer"; slug: string; token: string; pageId: string; version: number },
): Promise<Blob> {
  const session = await client().auth.getSession();
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/catalog-media`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${session.data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(params),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`MENU_MEDIA_${response.status}`);
  return response.blob();
}
