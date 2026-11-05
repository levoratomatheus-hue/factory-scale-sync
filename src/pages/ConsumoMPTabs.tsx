import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConsumoMP from './ConsumoMP';
import ConsumoPigma from './ConsumoPigma';

export default function ConsumoMPTabs({ perfilNome }: { perfilNome: string }) {
  return (
    <Tabs defaultValue="zancollor" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="zancollor">Zan Collor</TabsTrigger>
        <TabsTrigger value="pigma">Pigma</TabsTrigger>
      </TabsList>
      <TabsContent value="zancollor">
        <ConsumoMP perfilNome={perfilNome} />
      </TabsContent>
      <TabsContent value="pigma">
        <ConsumoPigma perfilNome={perfilNome} />
      </TabsContent>
    </Tabs>
  );
}
