import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { VerifyChange }      from '@/pages/VerifyChange';
import { Analysis }          from '@/pages/Analysis';
import { ConflictGraph }     from '@/pages/ConflictGraph';
import { ConflictDetail }    from '@/pages/ConflictDetail';
import { ChangePassportPage } from '@/pages/ChangePassport';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"         element={<VerifyChange />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/graph"    element={<ConflictGraph />} />
          <Route path="/detail"   element={<ConflictDetail />} />
          <Route path="/passport" element={<ChangePassportPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
