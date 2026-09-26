import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout }             from '@/components/Layout';
import { VerifyChange }       from '@/pages/VerifyChange';
import { Analysis }           from '@/pages/Analysis';
import { ConflictGraph }      from '@/pages/ConflictGraph';
import { ConflictDetail }     from '@/pages/ConflictDetail';
import { ChangePassportPage } from '@/pages/ChangePassport';

// Demo flow
import { DemoProvider }       from '@/demo/demoContext';
import { DemoLayout }         from '@/demo/DemoLayout';
import { DemoVerifyChange }   from '@/demo/DemoVerifyChange';
import { DemoAnalysis }       from '@/demo/DemoAnalysis';
import { DemoConflictGraph }  from '@/demo/DemoConflictGraph';
import { DemoConflictDetail } from '@/demo/DemoConflictDetail';
import { DemoChangePassport } from '@/demo/DemoChangePassport';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ── Regular exploration routes ──────────────────────────────── */}
        <Route element={<Layout><VerifyChange /></Layout>}       path="/" />
        <Route element={<Layout><Analysis /></Layout>}           path="/analysis" />
        <Route element={<Layout><ConflictGraph /></Layout>}      path="/graph" />
        <Route element={<Layout><ConflictDetail /></Layout>}     path="/detail" />
        <Route element={<Layout><ChangePassportPage /></Layout>} path="/passport" />

        {/* ── Judge demo flow (/demo/*) ────────────────────────────────── */}
        {/*
         *  All /demo/* routes share DemoProvider so the step machine is
         *  preserved across navigation. DemoLayout adds the sticky DemoBar.
         */}
        <Route
          path="/demo/*"
          element={
            <DemoProvider>
              <Layout>
                <DemoLayout>
                  <Routes>
                    {/* Entry point: /demo → /demo/verify */}
                    <Route index element={<Navigate to="verify" replace />} />
                    <Route path="verify"   element={<DemoVerifyChange />} />
                    <Route path="analysis" element={<DemoAnalysis />} />
                    <Route path="graph"    element={<DemoConflictGraph />} />
                    <Route path="detail"   element={<DemoConflictDetail />} />
                    <Route path="passport" element={<DemoChangePassport />} />
                  </Routes>
                </DemoLayout>
              </Layout>
            </DemoProvider>
          }
        />

      </Routes>
    </BrowserRouter>
  );
}
