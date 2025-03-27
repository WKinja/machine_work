const verifyToken = (roles = []) => {
    return async (req, res, next) => {
      const authHeader = req.header("Authorization");
  
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Access Denied. No token provided." });
      }
  
      const token = authHeader.split(" ")[1];
  
      try {
        const decoded = jwt.verify(token, secretKey);
        req.user = decoded;
  
        const user = await User.findById(decoded.id).populate("role");
        if (!roles.includes(user.role.roleName)) {
          return res.status(403).json({ message: "Forbidden: Insufficient permissions" });
        }
  
        next();
      } catch (err) {
        res.status(401).json({ message: "Invalid Token" });
      }
    };
  };
  