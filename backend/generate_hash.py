from passlib.hash import bcrypt

# Mot de passe à hasher
password = "bienfe123"

# Générer le hash
hash = bcrypt.hash(password)

# Afficher le résultat
print("Hash généré :")
print(hash)
print()
print("Copiez ce hash pour la mise à jour SQL")