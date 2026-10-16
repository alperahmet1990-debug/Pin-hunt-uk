"""Licensed coverage: manufacturer and retailer are separate dimensions, each pin counted once (BACKFILL-RULES 7, 11)."""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
from backfill_report import maker_retailer


class LicensedBrands(unittest.TestCase):
    def test_loungefly_at_boxlunch_is_one_maker_and_one_retailer(self):
        self.assertEqual(maker_retailer('lic/2018/loungefly-boxlunch-princess-mystery/ariel'), ('Loungefly', 'BoxLunch'))

    def test_retailer_only_and_multiword_slugs(self):
        self.assertEqual(maker_retailer('lic/2018/boxlunch-christmas/minnie-sweater'), ('Not stated', 'BoxLunch'))
        self.assertEqual(maker_retailer('lic/2019/loungefly-hot-topic-villains/ursula'), ('Loungefly', 'Hot Topic'))
        self.assertEqual(maker_retailer('lic/2022/pink-a-la-mode-cupcakes/stitch'), ('Not stated', 'Pink a la Mode'))  # retailer; maker only when a source says

    def test_artland_sold_at_dpb_store(self):
        self.assertEqual(maker_retailer('lic/2024/artland-dpbstore-alice-playing-card/alice'), ('ArtLand', 'DPB Store'))

    def test_claimed_fields_win_over_the_key(self):
        self.assertEqual(maker_retailer('lic/2019/boxlunch-wall-e/wall-e', {'Manufacturer': 'Loungefly'}), ('Loungefly', 'BoxLunch'))

    def test_unknown_and_non_licensed(self):
        self.assertEqual(maker_retailer('lic/2019/primark-mickey/mickey'), ('Not stated', 'Not stated'))
        self.assertIsNone(maker_retailer('wdw/2019/oe/stitch'))


if __name__ == '__main__':
    unittest.main()
