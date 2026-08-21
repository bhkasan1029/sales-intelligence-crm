"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export type FeedbackCategory = {
  value: "system_bug" | "rule_dispute";
  label: string;
  hint: string;
};

export const CATEGORY_BUG: FeedbackCategory = {
  value: "system_bug",
  label: "Technical / code bug",
  hint: "Goes to Admin only",
};

export const CATEGORY_RULE_DISPUTE: FeedbackCategory = {
  value: "rule_dispute",
  label: "Logical error",
  hint: "Goes to Admin + Regional Head",
};

const CATEGORIES: FeedbackCategory[] = [CATEGORY_BUG, CATEGORY_RULE_DISPUTE];

/**
 * `categories` narrows what the filer may pick. The Regional Head passes just
 * [CATEGORY_BUG]: a rule dispute routes *to* them, so there is nobody above
 * them to dispute a rule with — only a technical bug goes on to Admin.
 */
export default function FeedbackForm({
  categories = CATEGORIES,
}: {
  categories?: FeedbackCategory[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState<FeedbackCategory["value"]>(
    categories[0]!.value
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  const activeHint = categories.find((c) => c.value === category)?.hint;
  const singleCategory = categories.length === 1;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to submit");
        return;
      }
      toast.success("Feedback submitted");
      setSubject("");
      setBody("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
      <div className="space-y-1.5">
        <Label className="text-[#1A1A1A] font-medium">Category</Label>
        {singleCategory ? (
          // Nothing to choose between — show what it is instead of a lone
          // button that looks clickable but can't change anything.
          <div className="px-4 py-3 rounded-lg border border-gray-200 bg-gray-50">
            <p className="text-sm font-medium text-[#1A1A1A]">
              {categories[0]!.label}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {categories[0]!.hint}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {categories.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                    category === c.value
                      ? "border-[#1A1A1A] bg-[#1A1A1A]/5"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="text-sm font-medium text-[#1A1A1A]">{c.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.hint}</p>
                </button>
              ))}
            </div>
            {activeHint && (
              <p className="text-xs text-gray-500 pt-1">Routing: {activeHint}</p>
            )}
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subject" className="text-[#1A1A1A] font-medium">Subject</Label>
        <Input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          minLength={3}
          placeholder="Short summary"
          className="bg-white border-gray-200"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body" className="text-[#1A1A1A] font-medium">Details</Label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={5}
          rows={5}
          placeholder="Steps to reproduce, or the specific rule/logic that seems off"
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#1A1A1A]"
        />
      </div>

      <Button type="submit" disabled={loading} className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
      </Button>
    </form>
  );
}
