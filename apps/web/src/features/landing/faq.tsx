"use client";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
export function LandingFaq({ items }: { items: string[][] }) {
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue="0"
      className="faq-accordion"
    >
      {items.map(([q, a], i) => (
        <AccordionItem value={String(i)} key={q!}>
          <AccordionTrigger>{q}</AccordionTrigger>
          <AccordionContent>
            <p>{a}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
