import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConsumoMP from './ConsumoMP';
import ConsumoPigma from './ConsumoPigma';

export default function ConsumoMPTabs({ perfilNome }: { perfilNome: string }) {
  return (
    <Tabs defaultValue="zancollor" className="w-full">
      <TabsList className="mb-4 h-12 gap-2 bg-muted/60 p-1">
        <TabsTrigger
          value="zancollor"
          className="
            h-10 px-6 text-base font-bold tracking-wide rounded-md transition-all
            data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md
            data-[state=inactive]:text-blue-600 data-[state=inactive]:hover:bg-blue-50
          "
        >
          🏭 Zan Collor
        </TabsTrigger>
        <TabsTrigger
          value="pigma"
          className="
            h-10 px-6 text-base font-bold tracking-wide rounded-md transition-all
            data-[state=active]:bg-pink-500 data-[state=active]:text-white data-[state=active]:shadow-md
            data-[state=inactive]:text-pink-500 data-[state=inactive]:hover:bg-pink-50
          "
        >
          🌸 Pigma
        </TabsTrigger>
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
