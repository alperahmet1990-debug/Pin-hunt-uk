"""Licensed coverage is tracked per brand from the key's release slug (BACKFILL-RULES 7 and 11)."""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
from backfill_report import brands_of


class LicensedBrands(unittest.TestCase):
    def test_loungefly_at_boxlunch_counts_for_both(self):
        self.assertEqual(brands_of('lic/2018/loungefly-boxlunch-princess-mystery/ariel'), ['Loungefly', 'BoxLunch'])

    def test_retailer_only_and_multiword_brands(self):
        self.assertEqual(brands_of('lic/2018/boxlunch-christmas/minnie-sweater'), ['BoxLunch'])
        self.assertEqual(brands_of('lic/2019/loungefly-hot-topic-villains/ursula'), ['Loungefly', 'Hot Topic'])
        self.assertEqual(brands_of('lic/2022/pink-a-la-mode-cupcakes/stitch'), ['Pink a la Mode'])

    def test_unknown_brand_and_non_licensed(self):
        self.assertEqual(brands_of('lic/2019/primark-mickey/mickey'), ['Other licensed'])
        self.assertEqual(brands_of('wdw/2019/oe/stitch'), [])


if __name__ == '__main__':
    unittest.main()
