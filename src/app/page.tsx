import { Logo } from "@/components/brand";
import { BrushText, Container, Eyebrow } from "@/components/ui";

export default function Home() {
  return (
    <Container className="py-16">
      <Logo />
      <Eyebrow className="mt-10">Staff tools</Eyebrow>
      <h1 className="mt-2 text-4xl">
        Mileage <BrushText>reimbursement</BrushText>, without the paper
      </h1>
    </Container>
  );
}
