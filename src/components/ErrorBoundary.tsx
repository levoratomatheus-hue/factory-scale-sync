import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Mensagem customizada exibida acima do erro */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <div className="space-y-1">
          <p className="font-semibold text-base">
            {this.props.label ?? "Algo deu errado nesta tela"}
          </p>
          <p className="text-sm text-muted-foreground max-w-sm">
            {error.message || "Erro inesperado de renderização."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={this.reset}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }
}
