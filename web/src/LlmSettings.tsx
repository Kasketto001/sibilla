import { useState } from "react";
import { KeyRoundIcon } from "lucide-react";
import { EFFORTS, MODELS, PROVIDERS, effortFor, modelInfo, type Effort, type LlmOptions, type ModelId, type ProviderStatus } from "@sibilla/shared";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AccessDialog } from "./AccessDialog";
import { ProviderIcon } from "./ProviderIcon";

const models = MODELS.map((m) => ({ value: m.id, label: m.label }));

/** Compact control in the composer: which model answers, how hard it works, whether its reasoning is shown, and provider access. */
export function LlmSettings({ llm, providers, onChange, onProvidersChange }: {
  llm: LlmOptions;
  /** Empty while unknown: every model is then offered. */
  providers: ProviderStatus[];
  onChange: (patch: Partial<LlmOptions>) => void;
  onProvidersChange: (p: ProviderStatus[]) => void;
}) {
  const [access, setAccess] = useState(false);
  const model = modelInfo(llm.model);
  const effort = EFFORTS.find((e) => e.id === llm.effort)!;
  const efforts = EFFORTS.filter((e) => model.efforts.includes(e.id)).map((e) => ({ value: e.id, label: e.label }));
  const connected = (id: string) => providers.find((p) => p.id === id)?.configured ?? true;
  // A model that doesn't accept the current effort gets the closest one it does.
  const pick = (id: ModelId) => onChange({ model: id, effort: effortFor(id, llm.effort) });

  return (
    <>
      <Popover>
        <PopoverTrigger render={<Button variant="ghost" size="sm" className="min-w-0 font-normal text-muted-foreground" aria-label="Modello e ragionamento" />}>
          <ProviderIcon provider={model.provider} />
          <span className="truncate">{model.label} · {effort.label}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="llm-model">Modello</FieldLabel>
              <Select items={models} value={llm.model} onValueChange={(v) => v && pick(v as ModelId)}>
                <SelectTrigger id="llm-model" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectGroup key={p.id}>
                      <SelectLabel className="flex items-center gap-2">
                        <ProviderIcon provider={p.id} /> {p.label}
                        {!connected(p.id) && <span className="ml-auto font-normal">non collegato</span>}
                      </SelectLabel>
                      {MODELS.filter((m) => m.provider === p.id).map((m) => (
                        <SelectItem key={m.id} value={m.id} disabled={!connected(p.id)}>{m.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {connected(model.provider) ? model.hint : `${PROVIDERS.find((p) => p.id === model.provider)!.label} non è collegato: aggiungi la chiave API.`}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="llm-effort">Impegno</FieldLabel>
              <Select items={efforts} value={llm.effort} onValueChange={(v) => v && onChange({ effort: v as Effort })}>
                <SelectTrigger id="llm-effort" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{efforts.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
              <FieldDescription>Più impegno: risultati più curati, ma più tempo e costo.</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="llm-thinking">Mostra il ragionamento</FieldLabel>
              <Switch id="llm-thinking" checked={llm.thinking} onCheckedChange={(c) => onChange({ thinking: c })} />
            </Field>
            <Button variant="outline" size="sm" onClick={() => setAccess(true)}><KeyRoundIcon /> Accesso ai modelli</Button>
          </FieldGroup>
        </PopoverContent>
      </Popover>
      <AccessDialog open={access} providers={providers} onClose={() => setAccess(false)} onChange={onProvidersChange} />
    </>
  );
}
