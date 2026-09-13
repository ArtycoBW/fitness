"use client";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
export function ImageUpload({
  kind,
  id,
  url,
}: {
  kind: string;
  id: string;
  url?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  return (
    <div className="image-upload">
      {url && (
        <img src={url} width={240} height={160} alt="Фотография профиля" />
      )}
      <label className="upload-button">
        <ImagePlus size={17} />
        {busy ? "Загружаем…" : "Загрузить фотографию"}
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const form = new FormData();
              form.append("file", file);
              const csrf =
                document.cookie
                  .split("; ")
                  .find((v) => v.startsWith("fitness_csrf="))
                  ?.split("=")[1] ?? "";
              const res = await fetch("/api/v1/media/" + kind + "/" + id, {
                method: "POST",
                body: form,
                credentials: "include",
                headers: { "X-CSRF-Token": csrf },
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.message);
              await qc.invalidateQueries();
              toast.success("Фотография обновлена");
            } catch (e) {
              toast.error(
                e instanceof Error ? e.message : "Не удалось загрузить",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <small>JPG, PNG или WebP · до 5 МБ</small>
    </div>
  );
}
