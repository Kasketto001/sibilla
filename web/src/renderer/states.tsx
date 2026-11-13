import { Component, type ReactNode } from "react";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export function NodeError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>Impossibile caricare questo elemento</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export const Loading = ({ className = "h-24" }: { className?: string }) => <Skeleton className={`w-full ${className}`} />;

export const NoData = () => <p className="py-6 text-center text-sm text-muted-foreground">Nessun dato</p>;

/** One broken node must never take down the whole screen. */
export class NodeBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() { return this.state.error ? <NodeError message={this.state.error} /> : this.props.children; }
}
